@echo off
echo Checking if port 8001 is available...
netstat -ano | findstr :8001
echo.
echo Starting DecisionEngine backend on port 8001...
set PORT=8001
set FAST_MODE=false
cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload
