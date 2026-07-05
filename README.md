# AI Audio Separation Application

A production-grade, full-stack web application that separates uploaded MP3 songs into high-fidelity isolated **Vocals** and **Instrumentals (backing track)**. It leverages **FastAPI** on the backend, **Meta's Demucs** deep learning separation model running on **Modal Serverless GPU**, and a responsive **React + Vite + TypeScript** frontend styled with premium vanilla glassmorphism CSS.

---

## Architecture & Folder Structure

```
AI Audio/
├── backend/                  # FastAPI Application
│   ├── app/
│   │   ├── routes/           # REST Route Controllers
│   │   │   ├── api.py        # Uploads, separation triggers, job checks
│   │   │   └── downloads.py  # Audio stream and download handlers
│   │   ├── services/         # Layered business logic services
│   │   │   ├── storage.py    # Local filesystem storage provider abstraction
│   │   │   ├── modal_client.py# Handles remote invocation of Modal GPU function
│   │   │   └── job_manager.py# Manages background jobs and JSON log persistence
│   │   ├── config.py         # Application environment configs (pydantic-settings)
│   │   ├── models.py         # Type-safe schemas and status enums (pydantic)
│   │   └── main.py           # FastAPI entrypoint, CORS configuration
│   ├── requirements.txt      # Python dependencies
│   └── Dockerfile            # Container build for FastAPI service
├── frontend/                 # React + Vite + TS App
│   ├── src/
│   │   ├── components/       # Custom React Components
│   │   │   ├── AudioPlayer.tsx  # Premium custom HTML5 Audio controller
│   │   │   ├── Dashboard.tsx    # Dashboard with lists, progress & triggers
│   │   │   ├── ResultPage.tsx   # Detailed player cards & download controls
│   │   │   └── UploadZone.tsx   # Drag and drop area with size/format validations
│   │   ├── services/
│   │   │   └── api.ts        # Typed API service wrappers using XML/Fetch
│   │   ├── App.tsx           # Router and top-level layout
│   │   ├── index.css         # Styling system (variables, glassmorphic filters, animations)
│   │   └── main.tsx          # Mount entry point
│   ├── index.html            # Core page layout and Google Font bindings
│   ├── vite.config.ts        # Vite plugins and API dev proxy configuration
│   ├── package.json          # Node dependencies
│   └── Dockerfile            # Container build for Vite React development server
├── modal/                    # Modal Serverless GPU Deployments
│   └── demucs_app.py         # Demucs runner script (Packs torch/ffmpeg & models)
├── docker-compose.yml        # Multi-container local execution setup
├── PostmanCollection.json    # Ready-to-import HTTP request definitions
└── README.md                 # Project handbook
```

---

## Features

- **Asynchronous Background Processing**: Large file uploads are handled instantly, while audio separation runs on an asynchronous worker thread in FastAPI.
- **Modal Serverless GPU Integration**: Audio processing is executed on demand on high-performance GPUs (like Nvidia T4, A10G, or A100), keeping costs flat.
- **Cached Models on Container Image**: The Meta Demucs model is preloaded into the Modal container build, ensuring fast initialization times (warm starts).
- **Graceful Developer Mock**: Supports a dynamic mock fallback (`MOCK_MODAL=true`). Run the system instantly without registering a Modal account to verify UI flows and client loops.
- **Custom range audio players**: Independent controls for volume and tracking timeline, providing a native DJ-style isolation test center.

---

## ⚡ Quick Start (Using Docker Compose)

The fastest way to test the complete application locally is using Docker Compose. By default, it runs the backend in **Mock Mode**, meaning you do **not** need a Modal account to get started.

### Step 1: Clone and Start Containers
From the root of the project directory (`AI Audio/`), run:
```bash
docker-compose up --build
```

This launches:
- **Backend API**: Running on [http://localhost:8000](http://localhost:8000)
- **Frontend App**: Running on [http://localhost:5173](http://localhost:5173)

### Step 2: Access the Application
Open [http://localhost:5173](http://localhost:5173) in your browser. Drag and drop any MP3 file under 100MB, click **Separate**, and see the status change from `Queued` to `Processing`, completing in about 5 seconds (simulated processing in Mock Mode).

---

## 🚀 Setting Up Real Modal GPU Audio Separation

To execute actual audio separation on Modal GPU containers, follow these steps:

### Step 1: Set Up Modal CLI Locally
Make sure you have Python installed, then install and configure the Modal CLI:
```bash
pip install modal
python -m modal setup
```
*This opens a browser window to authenticate with your Modal account.*

### Step 2: Deploy the Demucs Function to Modal
Run the following from the root directory to upload and build the container image in the cloud:
```bash
cd modal
modal deploy demucs_app.py
```
This builds an image with `demucs`, `ffmpeg`, and `pytorch`, cache-downloads Meta's `htdemucs` neural network, and hosts it as `demucs-audio-separation`.

### Step 3: Configure FastAPI Backend with Modal Tokens
1. Retrieve your Modal API credentials by running `modal token new` or looking at your `~/.modal.toml` file.
2. Edit `docker-compose.yml` (or create a `.env` file in `backend/`) and update the environment keys:
   ```yaml
   environment:
     - MOCK_MODAL=false
     - MODAL_TOKEN_ID=ak-xxxxxxxxxxxxx
     - MODAL_TOKEN_SECRET=as-xxxxxxxxxxxxx
     - MODAL_GPU_TYPE=t4     # Optional (can be 't4', 'a10g', 'a100', 'l4')
   ```
3. Restart your backend service:
   ```bash
   docker-compose restart backend
   ```
Now, uploading any MP3 will send it to the cloud GPU, separate the stems, return the files as high-fidelity output tracks, and store them locally.

---

## 💻 Manual Setup (Without Docker)

If you wish to run the backend and frontend servers natively on your machine:

### Running the FastAPI Backend
1. Go to the backend directory and set up a virtual environment:
   ```bash
   cd backend
   python -m venv venv
   # Activate virtualenv:
   # On Windows:
   venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   ```
2. Install packages:
   ```bash
   pip install -r requirements.txt
   ```
3. (Optional) Set environment configurations:
   ```bash
   set MOCK_MODAL=true   # Windows CMD
   # or
   $env:MOCK_MODAL="true" # Windows PowerShell
   # or
   export MOCK_MODAL=true # macOS/Linux
   ```
4. Launch Uvicorn:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```

### Running the React Frontend
1. In a separate terminal, navigate to the frontend directory:
   ```bash
   cd frontend
   npm install
   ```
2. Run the development server:
   ```bash
   npm run dev
   ```
3. Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🔌 API Documentation

| Endpoint | Method | Payload | Description |
| :--- | :--- | :--- | :--- |
| `/health` | `GET` | *None* | Health status checks. |
| `/api/upload` | `POST` | `multipart/form-data` (MP3 file) | Validates extension & file size (<100MB), returns `file_id`. |
| `/api/separate` | `POST` | `{"file_id": "uuid-string"}` | Creates a separation task and triggers background Demucs execution. Returns `job_id`. |
| `/api/job/{jobId}` | `GET` | *None* | Returns job status (`QUEUED`, `PROCESSING`, `COMPLETED`, `FAILED`) and errors. |
| `/api/jobs` | `GET` | *None* | Lists history of all separation jobs. |
| `/api/download/{jobId}/vocals` | `GET` | *Optional query: ?download=true* | Stream or download separated vocals MP3. |
| `/api/download/{jobId}/instrumental`| `GET`| *Optional query: ?download=true* | Stream or download separated instrumental MP3. |
| `/api/download/{jobId}/original` | `GET` | *Optional query: ?download=true* | Stream or download original input audio file. |

You can use the **`PostmanCollection.json`** located in the root directory to test these endpoints directly using Postman.
