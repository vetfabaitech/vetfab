@echo off
setlocal enabledelayedexpansion
title VETFAB Launcher
cd /d "%~dp0"

echo ============================================
echo  VETFAB - starting Docker, backend, frontend
echo ============================================

REM --- 1. Make sure Docker Desktop is running -------------------------------
docker info >nul 2>&1
if not errorlevel 1 goto docker_ready

echo [1/4] Docker daemon not reachable, trying to start Docker Desktop...
if not exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" goto docker_missing
start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
echo   Waiting for Docker to come up, this can take a minute...

:wait_docker
timeout /t 3 >nul
docker info >nul 2>&1
if errorlevel 1 goto wait_docker
echo   Docker is up.
goto docker_ready

:docker_missing
echo   Could not find Docker Desktop.exe automatically.
echo   Please start Docker Desktop manually, then re-run this script.
pause
exit /b 1

:docker_ready
echo [1/4] Docker daemon is running.

REM --- 2. Make sure the HDL execution image is built ------------------------
docker image inspect hdl-webide-iverilog:latest >nul 2>&1
if errorlevel 1 goto build_exec_image
echo [2/4] Docker image hdl-webide-iverilog:latest already present.
goto check_backend_image

:build_exec_image
echo [2/4] Docker image hdl-webide-iverilog:latest not found, building it...
docker build -t hdl-webide-iverilog:latest backend\docker
if errorlevel 1 (
    echo   Docker image build failed.
    pause
    exit /b 1
)

REM --- 3. Make sure the backend language-service image is built --------------
REM hdl-webide-backend bundles FastAPI + svlangserver + Verilator + Verible +
REM Surelog (see backend\Dockerfile). First build compiles Surelog from
REM source and can take a long time; later builds are cached.
:check_backend_image
docker image inspect hdl-webide-backend:latest >nul 2>&1
if errorlevel 1 goto build_backend_image
echo [3/4] Docker image hdl-webide-backend:latest already present.
goto choose_mode

:build_backend_image
echo [3/4] Docker image hdl-webide-backend:latest not found, building it...
echo   NOTE: first build compiles Surelog from source and may take 30+ minutes.
docker build -t hdl-webide-backend:latest backend
if errorlevel 1 (
    echo   Backend image build failed.
    pause
    exit /b 1
)

REM --- 4. Pick how to run the backend ---------------------------------------
REM   [1] Docker container: all features incl. Verilog language intelligence
REM       (LSP/lint/format/index). The host Docker socket is mounted in so
REM       the Run/terminal pipeline can still create hdl-run-*/hdl-term-*
REM       containers on the host daemon. backend\.env is mounted read-only
REM       so Supabase/config values apply inside the container too.
REM   [2] Local uvicorn: old behavior. Run/terminal features work, but
REM       /lint, /format, /reindex and /ws/lsp return errors because the
REM       Linux-native language tools aren't installed on Windows.
:choose_mode
echo [4/4] Backend mode:
echo    1 = Docker container  (full: language intelligence + run pipeline)
echo    2 = Local uvicorn     (no language tools; legacy fallback)
choice /c 12 /t 10 /d 1 /m "  Choose backend mode (auto-selects 1 in 10s)"
if errorlevel 2 goto launch_local

:launch_container
echo   Starting backend container on http://localhost:8000 ...
docker rm -f vetfab-backend >nul 2>&1
set "ENV_MOUNT="
if exist "%~dp0backend\.env" set ENV_MOUNT=-v "%~dp0backend\.env:/app/.env:ro"
start "VETFAB Backend (Docker)" cmd /k docker run --rm --name vetfab-backend -p 8000:8000 -v hdl-webide-workspaces:/data/workspaces -v //var/run/docker.sock:/var/run/docker.sock %ENV_MOUNT% hdl-webide-backend:latest
goto launch_frontend

:launch_local
REM Uses "python -m uvicorn" instead of venv\Scripts\uvicorn.exe: that exe gets
REM blocked by Windows Device Guard / WDAC policy on this machine (unsigned
REM binary pip generated in the venv). python.exe itself is allowed.
start "VETFAB Backend"  cmd /k "cd /d "%~dp0backend" && call venv\Scripts\activate.bat && python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

:launch_frontend
start "VETFAB Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

REM --- 5. Auth: log-in backend (:8010) + log-in frontend (:5174) -------------
REM Separate app (see log-in\README/plan docs) -- GitHub OAuth + onboarding.
REM Same python.exe-not-venv-exe reasoning as :launch_local above.
start "VETFAB Auth Backend"  cmd /k "cd /d "%~dp0log-in\backend" && call venv\Scripts\activate.bat && python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8010"
start "VETFAB Auth Frontend" cmd /k "cd /d "%~dp0log-in\frontend" && npm run dev"

echo.
echo All services launched:
echo   Backend       -^> http://localhost:8000
echo   Frontend      -^> http://localhost:3000
echo   Auth Backend  -^> http://localhost:8010
echo   Auth Frontend -^> http://localhost:5174  (start here to sign in)
echo.
echo Close the spawned windows to stop the services.
echo (Docker backend: closing its window stops the container via --rm.)
pause
