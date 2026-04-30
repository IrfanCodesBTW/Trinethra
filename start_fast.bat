@echo off
echo Starting DecisionEngine backend in FAST MODE on port 8001...
set PORT=8001
set FAST_MODE=true
cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload
