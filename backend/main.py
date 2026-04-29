import os

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from parser import ParseError, extract_json
from prompt_builder import build_system_prompt, build_user_prompt

# To kill stale process on Windows:
# netstat -ano | findstr :8000
# taskkill /PID <PID> /F
# If process is unkillable (system-owned), use port 8001 instead via PORT=8001 env var

app = FastAPI(title="Trinethra Analyzer")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_GENERATE_URL = f"{OLLAMA_BASE_URL.rstrip('/')}/api/generate"
OLLAMA_TAGS_URL = f"{OLLAMA_BASE_URL.rstrip('/')}/api/tags"
MODEL_NAME = os.getenv("OLLAMA_MODEL", "gemma4:e2b")
OLLAMA_TIMEOUT_SECONDS = float(os.getenv("OLLAMA_TIMEOUT_SECONDS", "300"))
FAST_MODE = os.getenv("FAST_MODE", "false").lower() == "true"
PORT = int(os.getenv("PORT", 8001))
MAX_RETRIES = 3
MIN_TRANSCRIPT_CHARS = 50
MAX_TRANSCRIPT_CHARS = 10_000


class AnalyzeRequest(BaseModel):
    transcript: str
    fellow_name: str = ""
    company_name: str = ""
    fast_mode: bool = False


@app.get("/health")
async def health():
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get(OLLAMA_TAGS_URL)
            response.raise_for_status()
        models = response.json().get("models", [])
        matching_model = next(
            (
                model.get("name") or model.get("model")
                for model in models
                if MODEL_NAME in {model.get("name"), model.get("model")}
            ),
            None,
        )
        if not matching_model:
            return {
                "status": "error",
                "model": MODEL_NAME,
                "message": f'Ollama is reachable, but model "{MODEL_NAME}" is not installed.',
            }
        return {
            "status": "ok",
            "model": matching_model,
            "message": "Ollama is reachable and the configured model is installed.",
        }
    except httpx.ConnectError:
        return {
            "status": "error",
            "model": MODEL_NAME,
            "message": f"Ollama is not reachable at {OLLAMA_BASE_URL}. Is it running?",
        }
    except Exception:
        return {
            "status": "error",
            "model": MODEL_NAME,
            "message": f"Unable to verify Ollama model at {OLLAMA_BASE_URL}.",
        }


@app.post("/analyze")
async def analyze(req: AnalyzeRequest, fast_mode: bool | None = None):
    transcript = req.transcript.strip()
    if len(transcript) < MIN_TRANSCRIPT_CHARS:
        raise HTTPException(status_code=400, detail="Transcript too short (minimum 50 characters)")
    if len(transcript) > MAX_TRANSCRIPT_CHARS:
        raise HTTPException(status_code=400, detail="Transcript too long (maximum 10,000 characters)")

    effective_fast_mode = FAST_MODE or req.fast_mode or bool(fast_mode)
    system_prompt = build_system_prompt(fast_mode=effective_fast_mode)
    user_prompt = build_user_prompt(
        transcript,
        req.fellow_name,
        req.company_name,
        fast_mode=effective_fast_mode,
    )
    full_prompt = f"{system_prompt}\n\n{user_prompt}"

    last_error = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            timeout = httpx.Timeout(
                OLLAMA_TIMEOUT_SECONDS,
                connect=10.0,
                read=OLLAMA_TIMEOUT_SECONDS,
                write=30.0,
                pool=10.0,
            )
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(
                    OLLAMA_GENERATE_URL,
                    json={
                        "model": MODEL_NAME,
                        "prompt": full_prompt,
                        "stream": False,
                        "format": "json",
                        "options": {
                            "temperature": 0.1,
                            "num_predict": 2048,
                        },
                    },
                )
                response.raise_for_status()

            raw_text = response.json().get("response", "")
            return extract_json(raw_text)

        except ParseError as exc:
            last_error = str(exc)
            full_prompt += (
                f"\n\n[RETRY {attempt}] Your previous response failed validation: {last_error}. "
                "Return ONLY valid JSON starting with { and ending with }."
            )

        except httpx.TimeoutException as exc:
            raise HTTPException(
                status_code=504,
                detail=(
                    "Ollama timed out. The model took too long to respond. Try a shorter "
                    "transcript or switch to qwen2.5-coder:7b for faster results."
                ),
            ) from exc

        except httpx.ConnectError as exc:
            raise HTTPException(
                status_code=503,
                detail=f"Ollama is not reachable at {OLLAMA_BASE_URL}. Make sure Ollama is running.",
            ) from exc

        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"Ollama HTTP error: {exc}") from exc

        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Unexpected error: {str(exc)}") from exc

    raise HTTPException(
        status_code=500,
        detail=f"JSON parsing failed after {MAX_RETRIES} attempts. Last error: {last_error}",
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True)
