"""
backend/app.py - Flask API for Snowflake Lineage Explorer
"""

from flask import Flask, request, jsonify, session
from flask_cors import CORS
import snowflake.connector
from groq import Groq
import re
from typing import List, Dict, Tuple, Optional

app = Flask(__name__)
app.secret_key = 'your-secret-key-change-in-production'
CORS(app, supports_credentials=True)

# Store connections in memory (in production, use Redis or similar)
connections = {}


# --- Utility Functions ---
def clean_sql_remove_comments(sql: str) -> str:
    lines = []
    for line in sql.splitlines():
        if line.strip().startswith("--"):
            continue
        lines.append(line)
    joined = "\n".join(lines)
    joined = re.sub(r"/\*.*?\*/", "", joined, flags=re.DOTALL)
    return joined


def parse_llm_list_response(text: str) -> List[str]:
    items = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        m = re.match(r"^(?:\d+[\.\)]\s*|[-\*\u2022]\s*|â€¢\s*)(.+)$", line)
        if m:
            candidate = m.group(1).strip()
        else:
            candidate = line
        candidate = candidate.rstrip(".,;")
        if candidate:
            items.append(candidate)
    seen, out = set(), []
    for it in items:
        if it not in seen:
            seen.add(it)
            out.append(it)
    return out


def fully_qualify(name: str, default_db: str, default_schema: str) -> str:
    parts = name.split(".")
    parts = [p.strip() for p in parts if p.strip()]
    if len(parts) == 3:
        return ".".join(parts)
    if len(parts) == 2:
        if default_db:
            return f"{default_db}.{parts[0]}.{parts[1]}"
        return f"{parts[0]}.{parts[1]}"
    if len(parts) == 1:
        if default_db and default_schema:
            return f"{default_db}.{default_schema}.{parts[0]}"
        if default_schema:
            return f"{default_schema}.{parts[0]}"
        return parts[0]
    return name


def get_groq_response(api_key: str, messages: List[Dict[str, str]]) -> Tuple[str, int]:
    try:
        client = Groq(api_key=api_key)
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            temperature=0.2,
            max_tokens=1024,
            top_p=1,
            stream=False,
        )
        response_content = response.choices[0].message.content
        token_usage = getattr(response.usage, "total_tokens", 0) or response.usage.get("total_tokens", 0)
        return response_content.strip(), token_usage
    except Exception as e:
        return f"Error: {str(e)}", 0


def llm_extract_sources(api_key: str, ddl_sql: str, default_db: str, default_schema: str) -> Tuple[List[str], int]:
    cleaned = clean_sql_remove_comments(ddl_sql)
    prompt = f"""
You are an expert in Snowflake SQL. I will give you a CREATE OR REPLACE VIEW or DDL statement.
Task:
 - Extract the source tables/views that appear in FROM and JOIN clauses.
 - Ignore any commented-out lines.
 - Return fully qualified names if present (DATABASE.SCHEMA.OBJECT).
 - If a source is not fully qualified, try to infer schema/database from context; otherwise return the name as-is.
 - Output a strict numbered list, one entry per line. No extra explanation.

DDL:
{cleaned}
"""
    messages = [
        {"role": "system", "content": "You are a SQL lineage extraction assistant."},
        {"role": "user", "content": prompt}
    ]
    resp_text, usage = get_groq_response(api_key, messages)
    if resp_text.startswith("Error:"):
        return [], 0
    candidates = parse_llm_list_response(resp_text)
    fq = [fully_qualify(c, default_db, default_schema) for c in candidates]
    return fq, usage


# --- Snowflake Functions ---
def list_databases(conn) -> List[str]:
    cur = conn.cursor()
    try:
        cur.execute("SHOW DATABASES")
        rows = cur.fetchall()
        names = []
        for r in rows:
            for idx in (1, 0):
                try:
                    nm = r[idx]
                    if nm and nm not in names:
                        names.append(nm)
                    break
                except Exception:
                    continue
        return names
    finally:
        cur.close()


def list_schemas(conn, database: str) -> List[str]:
    cur = conn.cursor()
    try:
        cur.execute(f"SHOW SCHEMAS IN DATABASE {database}")
        rows = cur.fetchall()
        names = []
        for r in rows:
            for idx in (1, 0):
                try:
                    nm = r[idx]
                    if nm and nm not in names:
                        names.append(nm)
                    break
                except Exception:
                    continue
        return names
    finally:
        cur.close()


def list_objects(conn, database: str, schema: str) -> List[Dict]:
    cur = conn.cursor()
    try:
        q = f"""
            SELECT table_name, table_type
            FROM "{database}".INFORMATION_SCHEMA.TABLES
            WHERE table_schema = '{schema}'
            ORDER BY table_name
        """
        cur.execute(q)
        rows = cur.fetchall()
        out = []
        for r in rows:
            tn, tt = r[0], r[1]
            typ = "VIEW" if "VIEW" in tt.upper() else "TABLE"
            out.append({"name": tn, "type": typ})
        return out
    finally:
        cur.close()


def get_ddl_for_object(conn, database: str, schema: str, name: str, obj_type: str = "VIEW") -> Optional[str]:
    cur = conn.cursor()
    try:
        fq = f"{database}.{schema}.{name}"
        q = f"SELECT GET_DDL('{obj_type.upper()}', '{fq}')"
        cur.execute(q)
        row = cur.fetchone()
        if not row:
            return None
        return row[0]
    finally:
        cur.close()


def is_view(conn, fq_name: str) -> Optional[bool]:
    try:
        parts = fq_name.split(".")
        if len(parts) == 3:
            db, schema, obj = parts
        elif len(parts) == 2:
            db, schema, obj = None, parts[0], parts[1]
        else:
            db, schema, obj = None, None, parts[0]
        cur = conn.cursor()
        try:
            if db and schema:
                q = f"""SELECT table_type FROM "{db}".INFORMATION_SCHEMA.TABLES
                WHERE table_schema = '{schema}' AND table_name = '{obj}' LIMIT 1"""
            elif schema:
                q = f"""SELECT table_type FROM INFORMATION_SCHEMA.TABLES
                WHERE table_schema = '{schema}' AND table_name = '{obj}' LIMIT 1"""
            else:
                q = f"""SELECT table_type FROM INFORMATION_SCHEMA.TABLES
                WHERE table_name = '{obj}' LIMIT 1"""
            cur.execute(q)
            r = cur.fetchone()
            if not r:
                return None
            return "VIEW" in r[0].upper()
        finally:
            cur.close()
    except Exception:
        return None


def resolve_lineage_recursive(conn, api_key: str, obj_db: str, obj_schema: str, obj_name: str,
                              visited: set, max_depth: int = 6, depth: int = 0) -> Dict:
    key = f"{obj_db}.{obj_schema}.{obj_name}"
    if key in visited:
        return {key: {"type": "LOOP", "sources": [], "note": "Already visited"}}
    if depth > max_depth:
        return {key: {"type": "MAX_DEPTH", "sources": [], "note": "Max recursion reached"}}

    visited.add(key)
    try:
        vt = is_view(conn, key)
    except Exception as e:
        return {key: {"type": "UNKNOWN", "sources": [], "error": f"is_view error: {e}"}}
    typ = "VIEW" if vt else ("TABLE" if vt is False else "UNKNOWN")

    if typ != "VIEW":
        return {key: {"type": typ, "sources": []}}

    try:
        ddl = get_ddl_for_object(conn, obj_db, obj_schema, obj_name, obj_type="VIEW")
    except Exception as e:
        return {key: {"type": "VIEW", "sources": [], "error": f"GET_DDL error: {e}"}}
    if not ddl:
        return {key: {"type": "VIEW", "sources": [], "error": "No DDL / permission denied"}}

    sources, _ = llm_extract_sources(api_key, ddl, default_db=obj_db, default_schema=obj_schema)
    children = []
    for src in sources:
        parts = src.split(".")
        if len(parts) == 3:
            s_db, s_schema, s_obj = parts
        elif len(parts) == 2:
            s_db, s_schema, s_obj = obj_db, parts[0], parts[1]
        else:
            s_db, s_schema, s_obj = obj_db, obj_schema, parts[0]
        child = resolve_lineage_recursive(conn, api_key, s_db, s_schema, s_obj, visited, max_depth, depth + 1)
        children.append(child)
    return {key: {"type": "VIEW", "sources": children}}


# --- API Routes ---
@app.route('/api/connect', methods=['POST'])
def connect():
    data = request.json
    account = data.get('account')
    user = data.get('user')
    password = data.get('password')
    groq_api_key = data.get('groq_api_key')

    if not all([account, user, password, groq_api_key]):
        return jsonify({'error': 'Missing required fields'}), 400

    # Test Groq API key
    try:
        test_messages = [{"role": "user", "content": "Hello"}]
        response, _ = get_groq_response(groq_api_key, test_messages)
        if response.startswith("Error:"):
            return jsonify({'error': 'Invalid Groq API key'}), 400
    except Exception as e:
        return jsonify({'error': f'Groq API validation failed: {str(e)}'}), 400

    # Connect to Snowflake
    try:
        conn = snowflake.connector.connect(
            user=user,
            password=password,
            account=account,
            client_session_keep_alive=False,
        )

        # Generate session ID
        import uuid
        session_id = str(uuid.uuid4())

        # Store connection and API key
        connections[session_id] = {
            'conn': conn,
            'groq_api_key': groq_api_key
        }

        return jsonify({
            'success': True,
            'session_id': session_id
        })
    except Exception as e:
        return jsonify({'error': f'Connection failed: {str(e)}'}), 500


@app.route('/api/databases', methods=['POST'])
def get_databases():
    data = request.json
    session_id = data.get('session_id')

    if session_id not in connections:
        return jsonify({'error': 'Invalid session'}), 401

    try:
        conn = connections[session_id]['conn']
        databases = list_databases(conn)
        return jsonify({'databases': databases})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/schemas', methods=['POST'])
def get_schemas():
    data = request.json
    session_id = data.get('session_id')
    database = data.get('database')

    if session_id not in connections:
        return jsonify({'error': 'Invalid session'}), 401

    try:
        conn = connections[session_id]['conn']
        schemas = list_schemas(conn, database)
        return jsonify({'schemas': schemas})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/objects', methods=['POST'])
def get_objects():
    data = request.json
    session_id = data.get('session_id')
    database = data.get('database')
    schema = data.get('schema')

    if session_id not in connections:
        return jsonify({'error': 'Invalid session'}), 401

    try:
        conn = connections[session_id]['conn']
        objects = list_objects(conn, database, schema)
        return jsonify({'objects': objects})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/lineage', methods=['POST'])
def build_lineage():
    data = request.json
    session_id = data.get('session_id')
    database = data.get('database')
    schema = data.get('schema')
    object_name = data.get('object_name')

    if session_id not in connections:
        return jsonify({'error': 'Invalid session'}), 401

    try:
        conn = connections[session_id]['conn']
        groq_api_key = connections[session_id]['groq_api_key']

        visited = set()
        lineage = resolve_lineage_recursive(conn, groq_api_key, database, schema, object_name, visited, max_depth=8)

        return jsonify({'lineage': lineage})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/logout', methods=['POST'])
def logout():
    data = request.json
    session_id = data.get('session_id')

    if session_id in connections:
        try:
            connections[session_id]['conn'].close()
        except:
            pass
        del connections[session_id]

    return jsonify({'success': True})


if __name__ == '__main__':
    app.run(debug=True, port=5000)