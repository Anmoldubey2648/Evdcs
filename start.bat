@echo off
title GridBricks Launcher
color 0A

echo ===================================================
echo     GridBricks - UK Wind Power Forecast Intelligence
echo ===================================================
echo.

cd /d "%~dp0"

:: 1. Check Python Virtual Environment
echo [1/3] Checking backend virtual environment...
if not exist "backend\.venv\Scripts\activate.bat" (
    echo Virtual environment not found. Creating backend\.venv...
    python -m venv backend\.venv
    if errorlevel 1 (
        echo [ERROR] Python is not installed or not in PATH. Please install Python 3.10+.
        pause
        exit /b 1
    )
    echo Installing backend dependencies...
    call backend\.venv\Scripts\activate.bat
    pip install -r backend\requirements.txt
) else (
    echo Backend virtual environment detected.
)

:: 2. Check Node Dependencies
echo.
echo [2/3] Checking frontend dependencies...
if not exist "node_modules\" (
    echo Node modules not found. Running npm install...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed. Please check Node.js installation.
        pause
        exit /b 1
    )
) else (
    echo Frontend node_modules detected.
)

:: 3. Launch Backend and Frontend
echo.
echo [3/3] Starting Backend and Frontend servers...
echo.

:: Free the local development ports used by the launcher.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; foreach($port in @(8001,5173)){ $owners=Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; foreach($owner in $owners){ if($owner -gt 0){ Write-Host ('Stopping PID '+$owner+' using port '+$port); Stop-Process -Id $owner -Force -ErrorAction Stop } } }; $deadline=(Get-Date).AddSeconds(10); while((Get-NetTCPConnection -State Listen -LocalPort 8001,5173 -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline){ Start-Sleep -Milliseconds 250 }; if(Get-NetTCPConnection -State Listen -LocalPort 8001,5173 -ErrorAction SilentlyContinue){ Write-Error 'Ports 8001 or 5173 remain occupied'; exit 1 }"
if errorlevel 1 goto port_cleanup_failed

set "BACKEND_PORT=8001"
set "FRONTEND_PORT=5173"

:: Start FastAPI backend in its own window
start "GridBricks Backend (FastAPI :%BACKEND_PORT%)" cmd /k "cd /d ""%~dp0backend"" && call .venv\Scripts\activate.bat && echo [GridBricks Backend Starting on port %BACKEND_PORT%...] && uvicorn main:app --reload --host 127.0.0.1 --port %BACKEND_PORT%"

:: Wait for the API health check before launching the frontend.
set "ATTEMPTS=0"
:wait_for_backend
curl.exe --silent --fail "http://127.0.0.1:%BACKEND_PORT%/health" >nul 2>&1
if not errorlevel 1 goto backend_ready
set /a ATTEMPTS+=1
if %ATTEMPTS% geq 30 goto backend_failed
timeout /t 1 /nobreak >nul
goto wait_for_backend

:backend_ready
:: Start Vite frontend in its own window
start "GridBricks Frontend (Vite :%FRONTEND_PORT%)" cmd /k "cd /d ""%~dp0"" && set ""VITE_API_PROXY_TARGET=http://127.0.0.1:%BACKEND_PORT%"" && echo [GridBricks Frontend Starting on port %FRONTEND_PORT%...] && node_modules\.bin\vite.cmd --host=127.0.0.1 --port=%FRONTEND_PORT% --strictPort"

:: Verify the frontend API proxy reaches this backend before opening the app.
set "ATTEMPTS=0"
:wait_for_frontend
curl.exe --silent --fail "http://127.0.0.1:%FRONTEND_PORT%/api/health" >nul 2>&1
if not errorlevel 1 goto frontend_ready
set /a ATTEMPTS+=1
if %ATTEMPTS% geq 30 goto frontend_failed
timeout /t 1 /nobreak >nul
goto wait_for_frontend

:frontend_ready
start http://localhost:%FRONTEND_PORT%

echo ===================================================
echo   GridBricks is running!
echo.
echo   - Frontend:  http://localhost:%FRONTEND_PORT%
echo   - Frontend API: http://localhost:%FRONTEND_PORT%/api
echo   - Backend:   http://127.0.0.1:%BACKEND_PORT%
echo   - API Docs:  http://127.0.0.1:%BACKEND_PORT%/docs
echo   - Health:    http://127.0.0.1:%BACKEND_PORT%/health
echo ===================================================
echo.
echo You can close this launcher window. To stop the servers,
echo simply close the two opened command windows.
echo.
pause
exit /b 0

:backend_failed
echo [ERROR] Backend did not become healthy on port %BACKEND_PORT% within 30 seconds.
echo Check the GridBricks Backend command window for the startup error.
pause
exit /b 1

:frontend_failed
echo [ERROR] Frontend API proxy did not become healthy on port %FRONTEND_PORT% within 30 seconds.
echo Check that Vite is running and points to backend port %BACKEND_PORT%.
pause
exit /b 1

:port_cleanup_failed
echo [ERROR] Could not free port 8001 or 5173. Close the blocking process and run start.bat again.
pause
exit /b 1
