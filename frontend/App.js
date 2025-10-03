import React, { useState, useEffect } from 'react';
import { Database, ChevronRight, FileText, Table, GitBranch, Download, LogOut, RefreshCw, Loader, AlertCircle, CheckCircle, Eye } from 'lucide-react';

const API_URL = 'http://localhost:5000/api';

export default function SnowflakeLineageExplorer() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [credentials, setCredentials] = useState({
    account: '',
    user: '',
    password: '',
    groq_api_key: ''
  });

  const [databases, setDatabases] = useState([]);
  const [schemas, setSchemas] = useState([]);
  const [objects, setObjects] = useState([]);
  const [selectedDb, setSelectedDb] = useState('');
  const [selectedSchema, setSelectedSchema] = useState('');
  const [selectedObject, setSelectedObject] = useState('');

  const [lineageTree, setLineageTree] = useState(null);
  const [buildingLineage, setBuildingLineage] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials)
      });

      const data = await response.json();

      if (response.ok) {
        setSessionId(data.session_id);
        setIsLoggedIn(true);
        fetchDatabases(data.session_id);
      } else {
        setError(data.error || 'Connection failed');
      }
    } catch (err) {
      setError('Network error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchDatabases = async (sid) => {
    try {
      const response = await fetch(`${API_URL}/databases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sid || sessionId })
      });
      const data = await response.json();
      if (response.ok) {
        setDatabases(data.databases);
        if (data.databases.length > 0) {
          setSelectedDb(data.databases[0]);
          fetchSchemas(data.databases[0], sid || sessionId);
        }
      }
    } catch (err) {
      setError('Failed to fetch databases');
    }
  };

  const fetchSchemas = async (db, sid) => {
    try {
      const response = await fetch(`${API_URL}/schemas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sid || sessionId, database: db })
      });
      const data = await response.json();
      if (response.ok) {
        setSchemas(data.schemas);
        if (data.schemas.length > 0) {
          setSelectedSchema(data.schemas[0]);
          fetchObjects(db, data.schemas[0], sid || sessionId);
        }
      }
    } catch (err) {
      setError('Failed to fetch schemas');
    }
  };

  const fetchObjects = async (db, schema, sid) => {
    try {
      const response = await fetch(`${API_URL}/objects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sid || sessionId, database: db, schema: schema })
      });
      const data = await response.json();
      if (response.ok) {
        setObjects(data.objects);
        if (data.objects.length > 0) {
          setSelectedObject(data.objects[0].name);
        }
      }
    } catch (err) {
      setError('Failed to fetch objects');
    }
  };

  const buildLineage = async () => {
    if (!selectedDb || !selectedSchema || !selectedObject) {
      setError('Please select database, schema, and object');
      return;
    }

    setBuildingLineage(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/lineage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          database: selectedDb,
          schema: selectedSchema,
          object_name: selectedObject
        })
      });

      const data = await response.json();

      if (response.ok) {
        setLineageTree(data.lineage);
      } else {
        setError(data.error || 'Failed to build lineage');
      }
    } catch (err) {
      setError('Network error: ' + err.message);
    } finally {
      setBuildingLineage(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch(`${API_URL}/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId })
      });
    } catch (err) {
      console.error('Logout error:', err);
    }

    setIsLoggedIn(false);
    setSessionId(null);
    setLineageTree(null);
    setDatabases([]);
    setSchemas([]);
    setObjects([]);
  };

  const exportLineage = (format) => {
    if (!lineageTree) return;

    if (format === 'text') {
      const text = renderLineageAsText(lineageTree);
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'lineage.txt';
      a.click();
    } else if (format === 'csv') {
      const csv = convertLineageToCSV(lineageTree);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'lineage.csv';
      a.click();
    }
  };

  const renderLineageAsText = (tree, indent = 0, prefix = '', isLast = true) => {
    let text = '';
    for (const [key, value] of Object.entries(tree)) {
      const type = value.type || 'UNKNOWN';
      const sources = value.sources || [];

      if (indent === 0) {
        text += `\nANALYZING: ${key}\n${'='.repeat(80)}\n\n`;
        if (type === 'TABLE') {
          text += 'This is a BASE TABLE - No dependencies\n';
          return text;
        }
        if (type === 'VIEW' && sources.length === 0) {
          text += 'No dependencies found\n';
          return text;
        }
        text += 'DEPENDENCIES:\n\n';
        sources.forEach((child, i) => {
          text += renderLineageAsText(child, 1, '', i === sources.length - 1);
        });
      } else {
        const connector = isLast ? '└── ' : '├── ';
        const extension = isLast ? '    ' : '│   ';
        const icon = type === 'VIEW' ? '[VIEW]' : type === 'TABLE' ? '[TABLE]' : '[?]';

        text += `${prefix}${connector}${icon} ${key.split('.').pop()}\n`;

        if (type !== 'LOOP' && sources.length > 0) {
          sources.forEach((child, i) => {
            text += renderLineageAsText(child, indent + 1, prefix + extension, i === sources.length - 1);
          });
        }
      }
    }
    return text;
  };

  const convertLineageToCSV = (tree) => {
    const paths = [];
    extractPaths(tree, [], paths);

    const maxDepth = Math.max(...paths.map(p => p.length), 1);
    let csv = 'Analyzed Object';
    for (let i = 1; i < maxDepth; i++) {
      csv += `,Level ${i} Source`;
    }
    csv += ',Table\n';

    paths.forEach(path => {
      if (path.length === 0) return;
      const row = [path[0].name];
      for (let i = 1; i < maxDepth; i++) {
        row.push(i < path.length ? path[i].name : '');
      }
      row.push(path[path.length - 1].name);
      csv += row.map(v => `"${v}"`).join(',') + '\n';
    });

    return csv;
  };

  const extractPaths = (tree, currentPath, allPaths) => {
    for (const [key, value] of Object.entries(tree)) {
      const node = { name: key, type: value.type };
      const newPath = [...currentPath, node];
      const sources = value.sources || [];

      if (sources.length === 0 || value.type === 'TABLE' || value.type === 'LOOP') {
        allPaths.push(newPath);
      } else {
        sources.forEach(source => extractPaths(source, newPath, allPaths));
      }
    }
  };

  const TreeNode = ({ nodeKey, value, indent = 0, isLast = true, prefix = '' }) => {
    const [isExpanded, setIsExpanded] = useState(true);
    const type = value.type || 'UNKNOWN';
    const sources = value.sources || [];
    const connector = isLast ? '└── ' : '├── ';
    const extension = isLast ? '    ' : '│   ';

    const getIcon = () => {
      if (type === 'VIEW') return <Eye className="w-4 h-4 text-blue-400" />;
      if (type === 'TABLE') return <Table className="w-4 h-4 text-green-400" />;
      if (type === 'LOOP') return <AlertCircle className="w-4 h-4 text-red-400" />;
      return <FileText className="w-4 h-4 text-gray-400" />;
    };

    const getTypeColor = () => {
      if (type === 'VIEW') return 'text-blue-400';
      if (type === 'TABLE') return 'text-green-400';
      if (type === 'LOOP') return 'text-red-400';
      return 'text-gray-400';
    };

    return (
      <div className="font-mono text-sm">
        <div className="flex items-center gap-2 py-1 hover:bg-gray-800/50 rounded px-2">
          <span className="text-gray-500">{prefix}{connector}</span>
          {getIcon()}
          <span className="font-semibold text-gray-200">{nodeKey.split('.').pop()}</span>
          <span className={`text-xs ${getTypeColor()}`}>[{type}]</span>
          {sources.length > 0 && type !== 'LOOP' && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="ml-2 text-gray-500 hover:text-gray-300"
            >
              <ChevronRight className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
            </button>
          )}
        </div>
        {isExpanded && sources.length > 0 && type !== 'LOOP' && (
          <div className="ml-4">
            {sources.map((child, i) => {
              const childKey = Object.keys(child)[0];
              return (
                <TreeNode
                  key={childKey}
                  nodeKey={childKey}
                  value={child[childKey]}
                  indent={indent + 1}
                  isLast={i === sources.length - 1}
                  prefix={prefix + extension}
                />
              );
            })}
          </div>
        )}
      </div>
    );
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center p-6">
        <div className="bg-gray-800/50 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-700 w-full max-w-md p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-500/20 rounded-full mb-4">
              <Database className="w-8 h-8 text-blue-400" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Snowflake</h1>
            <h2 className="text-xl font-semibold text-blue-400">LINEAGE EXPLORER</h2>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Snowflake Account</label>
              <input
                type="text"
                value={credentials.account}
                onChange={(e) => setCredentials({...credentials, account: e.target.value})}
                className="w-full px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition"
                placeholder="account.region"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Username</label>
              <input
                type="text"
                value={credentials.user}
                onChange={(e) => setCredentials({...credentials, user: e.target.value})}
                className="w-full px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition"
                placeholder="username"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Password</label>
              <input
                type="password"
                value={credentials.password}
                onChange={(e) => setCredentials({...credentials, password: e.target.value})}
                className="w-full px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition"
                placeholder="password"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Groq API Key</label>
              <input
                type="password"
                value={credentials.groq_api_key}
                onChange={(e) => setCredentials({...credentials, groq_api_key: e.target.value})}
                className="w-full px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition"
                placeholder="gsk_..."
                required
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  Connecting...
                </>
              ) : (
                'Connect to Snowflake'
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-700">
            <p className="text-xs text-gray-500 text-center">
              A Spectra Solutions property - Strictly for internal use only
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900">
      <div className="bg-gray-800/50 backdrop-blur-xl border-b border-gray-700">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-blue-500/20 p-2 rounded-lg">
                <Database className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Snowflake Lineage Explorer</h1>
                <p className="text-xs text-gray-400">Data lineage visualization tool</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-6">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-3">
            <div className="bg-gray-800/50 backdrop-blur-xl rounded-xl border border-gray-700 p-6 space-y-5">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <GitBranch className="w-5 h-5 text-blue-400" />
                Object Selection
              </h2>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Database</label>
                <select
                  value={selectedDb}
                  onChange={(e) => {
                    setSelectedDb(e.target.value);
                    fetchSchemas(e.target.value, sessionId);
                  }}
                  className="w-full px-3 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                >
                  {databases.map(db => (
                    <option key={db} value={db}>{db}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Schema</label>
                <select
                  value={selectedSchema}
                  onChange={(e) => {
                    setSelectedSchema(e.target.value);
                    fetchObjects(selectedDb, e.target.value, sessionId);
                  }}
                  className="w-full px-3 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                >
                  {schemas.map(schema => (
                    <option key={schema} value={schema}>{schema}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Table / View</label>
                <select
                  value={selectedObject}
                  onChange={(e) => setSelectedObject(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                >
                  {objects.map(obj => (
                    <option key={obj.name} value={obj.name}>
                      {obj.type === 'VIEW' ? '📊' : '📋'} {obj.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={buildLineage}
                disabled={buildingLineage}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {buildingLineage ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    Building...
                  </>
                ) : (
                  <>
                    <GitBranch className="w-5 h-5" />
                    Build Lineage
                  </>
                )}
              </button>

              <button
                onClick={() => fetchDatabases(sessionId)}
                className="w-full bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh Lists
              </button>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-9">
            <div className="bg-gray-800/50 backdrop-blur-xl rounded-xl border border-gray-700 overflow-hidden">
              <div className="border-b border-gray-700 p-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-400" />
                  Lineage Visualization
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => exportLineage('text')}
                    disabled={!lineageTree}
                    className="px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded-lg transition-colors flex items-center gap-2 text-sm"
                  >
                    <Download className="w-4 h-4" />
                    Export Text
                  </button>
                  <button
                    onClick={() => exportLineage('csv')}
                    disabled={!lineageTree}
                    className="px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded-lg transition-colors flex items-center gap-2 text-sm"
                  >
                    <Download className="w-4 h-4" />
                    Export CSV
                  </button>
                  <button
                    onClick={() => setLineageTree(null)}
                    disabled={!lineageTree}
                    className="px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded-lg transition-colors text-sm"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="p-6 min-h-[600px] max-h-[calc(100vh-250px)] overflow-auto">
                {error && (
                  <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-red-300 mb-1">Error</p>
                      <p className="text-sm text-red-300/80">{error}</p>
                    </div>
                  </div>
                )}

                {!lineageTree && !error && (
                  <div className="flex flex-col items-center justify-center h-full text-gray-500">
                    <GitBranch className="w-16 h-16 mb-4 opacity-50" />
                    <p className="text-lg font-medium">No lineage data</p>
                    <p className="text-sm mt-2">Select an object and click "Build Lineage" to get started</p>
                  </div>
                )}

                {lineageTree && (
                  <div className="space-y-4">
                    {Object.entries(lineageTree).map(([key, value]) => (
                      <div key={key}>
                        <div className="mb-4 pb-4 border-b border-gray-700">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="bg-blue-500/20 p-2 rounded-lg">
                              <Database className="w-5 h-5 text-blue-400" />
                            </div>
                            <div>
                              <p className="text-sm text-gray-400">Analyzing</p>
                              <p className="text-lg font-bold text-white">{key}</p>
                            </div>
                          </div>
                        </div>

                        {value.type === 'TABLE' ? (
                          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 flex items-center gap-3">
                            <CheckCircle className="w-5 h-5 text-green-400" />
                            <p className="text-green-300">This is a BASE TABLE - No dependencies</p>
                          </div>
                        ) : value.sources && value.sources.length > 0 ? (
                          <div>
                            <p className="text-sm font-semibold text-gray-400 mb-3">DEPENDENCIES:</p>
                            {value.sources.map((child, i) => {
                              const childKey = Object.keys(child)[0];
                              return (
                                <TreeNode
                                  key={childKey}
                                  nodeKey={childKey}
                                  value={child[childKey]}
                                  isLast={i === value.sources.length - 1}
                                />
                              );
                            })}
                          </div>
                        ) : (
                          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 flex items-center gap-3">
                            <CheckCircle className="w-5 h-5 text-blue-400" />
                            <p className="text-blue-300">No dependencies found</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}