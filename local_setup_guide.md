# AI Audio Separation - Local Setup Guide

This guide walks you through setting up and running the entire full-stack application (React frontend, FastAPI backend, and Modal serverless GPU integrations) locally on your system.

---

## Prerequisites
Before you start, ensure you have the following installed:
1. **Python 3.10 or 3.11** (Check with `python --version`)
2. **Node.js (v18 or higher)** and `npm` (Check with `node -v` and `npm -v`)
3. **Docker Desktop** (Optional, only if running with Docker Compose)

---

## ⚡ Option 1: Quick Start with Docker Compose (Recommended)
This option automatically builds and spins up both the frontend and backend in **Mock Mode** (no Modal account required).

1. Ensure **Docker Desktop** is open and running.
2. From the project root folder (`AI Audio/`), run:
   ```bash
   docker-compose up --build
   ```
3. Open your browser and navigate to: **[http://localhost:5173](http://localhost:5173)**.

To switch from Mock Mode to actual Modal GPU execution inside Docker, update the `environment` section in your [docker-compose.yml](file:///c:/Users/LENOVO/Documents/Codex/2026-06-13/files-mentioned-by-the-user-image/work/AI%20Audio/docker-compose.yml) file to set `MOCK_MODAL=false` and provide your Modal credentials.

---

## 💻 Option 2: Step-by-Step Manual Setup (Local Servers)
If you prefer running the servers natively on your machine, follow these steps:

### Phase 1: Set up Modal CLI (Cloud GPU Services)
1. Install the Modal client library:
   ```bash
   pip install modal
   ```
2. Link your machine to your Modal account:
   ```bash
   modal setup
   ```
   *(This will open a browser tab to log in/authenticate with your Modal account).*
3. Deploy the two Modal serverless GPU applications:
   ```bash
   # 1. Deploy the Demucs Separation App
   modal deploy modal/demucs_app.py

   # 2. Deploy the Backing Vocals Extraction App (BVE)
   $env:PYTHONIOENCODING="utf-8"  # Windows PowerShell helper
   modal deploy backing_vocals_service.py
   ```

---

### Phase 2: Start the FastAPI Backend
1. Open a terminal and navigate to the backend folder:
   ```bash
   cd backend
   ```
2. Create and activate a Python virtual environment:
   ```bash
   python -m venv venv
   
   # Activate:
   # On Windows:
   venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   ```
3. Install the backend dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Configure environment variables. Set `MOCK_MODAL` to `false` for real Modal GPU processing, or `true` for simulated local runs:
   ```bash
   # Windows PowerShell:
   $env:MOCK_MODAL="false"
   $env:PYTHONPATH="."

   # Windows CMD:
   set MOCK_MODAL=false
   set PYTHONPATH=.

   # macOS/Linux:
   export MOCK_MODAL=false
   export PYTHONPATH=.
   ```
5. Launch the FastAPI server:
   ```bash
   python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
   ```
   *The API will be available at [http://127.0.0.1:8000](http://127.0.0.1:8000).*

---

### Phase 3: Start the React Frontend
1. Open a **new** terminal window and navigate to the frontend folder:
   ```bash
   cd frontend
   ```
2. Install the Node packages:
   ```bash
   npm install
   ```
3. Start the Vite React development server:
   ```bash
   npm run dev
   ```
4. Open the displayed URL in your browser: **[http://localhost:5173](http://localhost:5173)**.

---

## 🔍 How to Test the Setup
1. Open the UI at [http://localhost:5173](http://localhost:5173).
2. Upload any small MP3 song.
3. Select your model of choice:
   * **Meta Demucs**: Supports 2 stems or 4 stems.
   * **UVR MDX-Net**: Supports 2 stems.
   * **Backing Vocals Extraction**: Locks to 3 stems (Lead, Backing, Instrumental).
4. Click **Separate** and watch the job status update. When finished, inspect the DJ-style audio players and verify you can listen and download each individual stem!
