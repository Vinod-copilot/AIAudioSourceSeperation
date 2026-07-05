@echo off
SETLOCAL EnableDelayedExpansion

echo ===================================================
echo   AI Audio Separation App Launcher
echo ===================================================
echo.

:: Check for Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH. Please install Node.js first.
    pause
    exit /b 1
)

:: Check for Python
where python >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Python is not installed or not in PATH. Please install Python 3.9+ first.
    pause
    exit /b 1
)

:: Setup Backend Virtual Env if not present
if not exist "backend\venv" (
    echo [INFO] Creating Python virtual environment in backend\venv...
    python -m venv backend\venv
    if !ERRORLEVEL! neq 0 (
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
)

:: Install backend requirements
echo [INFO] Ensuring backend dependencies are installed...
backend\venv\Scripts\python.exe -m pip install -r backend\requirements.txt
if %ERRORLEVEL% neq 0 (
    echo [WARNING] Failed to install/verify backend requirements.
)

:: Install frontend requirements if node_modules not present
if not exist "frontend\node_modules" (
    echo [INFO] Installing frontend dependencies...
    cd frontend
    call npm install
    cd ..
)

echo.
echo [INFO] Starting servers...
echo.

:: Launch Backend in a new window
start "AI Audio Backend Server" cmd /k "cd backend && venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000"

:: Launch Frontend in a new window
start "AI Audio Frontend Dev Server" cmd /k "cd frontend && npm run dev"

echo ===================================================
echo   Application launched successfully!
echo.
echo   Backend running at: http://127.0.0.1:8000
echo   Frontend running at: http://localhost:5173
echo.
echo   Keep this window open or press any key to exit this launcher.
echo   (The server windows will remain open in the background)
echo ===================================================
pause
