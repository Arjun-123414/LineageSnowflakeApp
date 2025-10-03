# 🚀 Lineage App

A modern full-stack web application with React frontend and Flask backend.

## 📋 Prerequisites

Before you begin, ensure you have installed in your system:
- **Node.js** (v14 or higher)
- **Python** (v3.7 or higher)
- **npm** (comes with Node.js)

- **In terminal you can check if you have node.js or not by typing**
 **i)**  node -v
  <img width="940" height="243" alt="image" src="https://github.com/user-attachments/assets/11a36ad8-2dda-4f6c-9071-00eace567140" />


## 🛠️ Quick Start



### Step 1: Setup Frontend

```bash
cd frontend
npm install
```
<img width="1652" height="355" alt="image" src="https://github.com/user-attachments/assets/38bcda48-7458-4e95-8a21-6434625d80da" />


### Step 3: Setup Backend

```bash
cd backend
pip install -r requirements.txt
```
<img width="1106" height="357" alt="image" src="https://github.com/user-attachments/assets/a6a23fcc-e177-4c4c-b075-740cbb2067c4" />


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
│   ├── app.py                
│   └── requirements.txt       
│
└── frontend/
    ├── public/
    │   └── index.html        
    │
    ├── src/
    │   ├── App.js            
    │   ├── index.js          
    │   └── index.css        
    │
    ├── package.json          
    ├── tailwind.config.js    
    └── postcss.config.js     
```



---

Note:- This is just a prototype final version. All the changes, like server design enhancements, need to be done
