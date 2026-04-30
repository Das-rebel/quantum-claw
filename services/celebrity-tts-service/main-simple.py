"""
Celebrity TTS - Simple Version (No XTTS dependency)
"""
from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional

app = FastAPI(title="Celebrity TTS")

class TTSRequest(BaseModel):
    text: str
    celebrity: str = "morgan_freeman"
    language: str = "en"

class TTSResponse(BaseModel):
    success: bool
    audio_url: Optional[str] = None
    message: str

@app.get("/health")
def health():
    return {"status": "healthy", "service": "celebrity-tts", "model": "mock"}

@app.get("/celebrities")
def list_celebrities():
    return {
        "celebrities": ["morgan_freeman", "amitabh_bachan", "alia_bhatt"],
        "count": 3
    }

@app.post("/synthesize", response_model=TTSResponse)
def synthesize(request: TTSRequest):
    return TTSResponse(
        success=True,
        audio_url=f"/audio/{request.celebrity}/sample.wav",
        message=f"Mock TTS for {request.celebrity}"
    )

if __name__ == "__main__":
    import uvicorn
    import os
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))
