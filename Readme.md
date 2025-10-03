# 🚀 Lineage App

A modern full-stack web application with React frontend and Flask backend.

## 📋 Prerequisites

Before you begin, ensure you have installed:
- **Node.js** (v14 or higher)
- **Python** (v3.7 or higher)
- **npm** (comes with Node.js)

## 🛠️ Quick Start



### Step 1: Setup Frontend

```bash
cd frontend
npm install
```


### Step 3: Setup Backend

```bash
cd ../backend
pip install -r requirements.txt
```


## 🚀 Running the Application

You'll need **2 terminal windows** to run both frontend and backend simultaneously.

### Terminal 1 - Backend

```bash
cd backend
python app.py
```
<img width="1915" height="781" alt="image" src="https://github.com/user-attachments/assets/3aa58830-430e-4bbb-b308-a19852dfb4dd" />
✅ You should see: `Running on http://127.0.0.1:5000`

### Terminal 2 - Frontend

```bash
cd frontend
npm start
```
<img width="1918" height="853" alt="image" src="https://github.com/user-attachments/assets/cdebad71-a8fa-433b-bf91-5bfad749112c" />
✅ Browser will automatically open at: `http://localhost:3000`

## 📁 Project Structure

```
snowflake-lineage-explorer/
│
├── backend/
│   ├── app.py                 ← Copy Flask code here
│   └── requirements.txt       ← Copy dependencies here
│
└── frontend/
    ├── public/
    │   └── index.html        ← Create this HTML
    │
    ├── src/
    │   ├── App.js            ← Copy React code here
    │   ├── index.js          ← Create entry point
    │   └── index.css         ← Create Tailwind CSS
    │
    ├── package.json          ← Copy package config
    ├── tailwind.config.js    ← Create Tailwind config
    └── postcss.config.js     ← Create PostCSS config
```



---

⭐ If you found this project helpful, please give it a star!
