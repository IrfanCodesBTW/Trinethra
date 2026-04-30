# Trinethra - Supervisor Feedback Analyzer

Trinethra is a local-first draft assessment tool for DeepThought supervisor feedback transcripts. It sends a transcript to a locally running Ollama model and returns a structured five-section assessment for psychology-intern review: score, evidence, KPI mapping, gaps, and follow-up questions.

The AI output is always a draft. The intern reviews it, can override the score with a mandatory reason, and can save or export the assessment locally.

## Setup Instructions

### Prerequisites

- Python 3.10+
- Ollama installed from https://ollama.com
- Chrome or Firefox desktop browser

### 1. Pull a local model

The app defaults to `gemma4:e2b` because the assignment environment targeted a local Gemma model with structured JSON output. You can use another local Ollama model by setting `OLLAMA_MODEL`.

```powershell
ollama pull gemma4:e2b
```

Optional fallback:

```powershell
$env:OLLAMA_MODEL="qwen2.5-coder:7b"
ollama pull qwen2.5-coder:7b
```

### 2. Install backend dependencies

```powershell
cd backend
pip install -r requirements.txt
```

### 3. Start the backend on the app default port

```powershell
$env:PORT="8001"
python -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

You can also run:

```powershell
./start.bat
```

### 4. Open the frontend

Open:

```text
index.html
```

The frontend defaults to:

```text
http://localhost:8001
```

To override the backend URL for one browser session:

```text
index.html?api=http://localhost:8001
```

### 5. Verify health

Visit:

```text
http://localhost:8001/health
```

Expected shape:

```json
{
  "status": "ok",
  "model": "gemma4:e2b",
  "message": "Ollama is reachable and the configured model is installed."
}
```

## Architecture Overview

```text
index.html
  -> app.js
  -> POST http://localhost:8001/analyze
backend/main.py
  -> prompt_builder.py builds full or fast prompt from rubric.json
  -> Ollama /api/generate at OLLAMA_BASE_URL
  -> parser.py extracts, normalizes, and validates strict JSON
  -> frontend renders five review sections
  -> localStorage stores settings and saved assessments
```

The backend is stateless. Saved assessments live only in browser `localStorage`; there is no database, authentication, or cloud API dependency.

## Model Choice Rationale

- Default model: `gemma4:e2b`, matching the local Gemma setup used for this assignment.
- Fallback model: `qwen2.5-coder:7b`, useful on machines where coder-tuned JSON adherence is preferred.
- Temperature is fixed at `0.1` to reduce output variance.
- Ollama output uses `format: "json"`, `stream: false`, and `num_predict >= 2048` to reduce malformed or truncated responses.
- Fast Mode keeps the same rubric, bias, KPI, dimension, schema, and hallucination controls while shortening explanatory text.

## Design Decisions

1. Single prompt per analysis keeps the intern workflow fast enough for review calls.
2. `rubric.json` is injected into the prompt so score labels, bands, and key signals are data-driven.
3. The prompt explicitly counters five supervisor biases: helpfulness bias, presence bias, halo effect, recency bias, and glowing without systems.
4. The parser rejects malformed output before the frontend sees it and the backend retries up to three times.
5. The score override requires a reason and is saved/exported with override metadata.
6. Vanilla HTML/CSS/JS avoids a frontend build step and keeps setup simple for non-developer users.

## Environment Variables

```powershell
$env:PORT="8001"
$env:OLLAMA_BASE_URL="http://localhost:11434"
$env:OLLAMA_MODEL="gemma4:e2b"
$env:OLLAMA_TIMEOUT_SECONDS="300"
$env:FAST_MODE="false"
```

## Sample Transcript Acceptance Checks

The frontend includes three sample loaders designed to catch scoring and bias mistakes:

- Karthik / Veerabhadra Auto: expected score 6-7. Must flag lack of push-back and limited survivability of the Excel sheet.
- Meena / Lakshmi Textiles: expected score 7-8. Must flag presence bias while recognizing the dashboard and team adoption.
- Anil / Prabhat Foods: expected score 5-6. Must identify task absorption, right-hand dependency, and no surviving system.

Manual acceptance target:

- All three sample scores within +/-1 of expected range.
- Anil must not score above 6 unless the transcript changes to include durable systems.
- Draft warning visible in the score section.
- Loading state visible during model call.
- Score override opens, blocks empty reason, saves valid override, and persists into archive/export.

## Tests

Run parser tests:

```powershell
cd backend
python -m unittest test_parser.py
```

Run syntax check:

```powershell
cd F:\projects\assessment\Trinethra
python -m py_compile backend/main.py backend/parser.py backend/prompt_builder.py
```

## Useful Files

- `backend/main.py` - FastAPI app, CORS, health, analyze, Ollama integration, retry loop.
- `backend/prompt_builder.py` - Full and fast prompts with rubric, dimensions, KPIs, biases, schema, controls.
- `backend/parser.py` - JSON extraction, normalization, validation, parse errors.
- `backend/rubric.json` - PRD-aligned 1-10 scoring rubric.
- `index.html` - Single-page app shell.
- `app.js` - API calls, rendering, settings, archive, score override, export.
- `style.css` - Visual styling and animation states.
#
