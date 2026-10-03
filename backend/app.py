import tempfile
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.staticfiles import StaticFiles

from backend.audio_normalizer import (
    AudioDecodingError,
    AudioNormalizationError,
    UnsupportedAudioFormatError,
    normalize_audio,
)
from backend.model_adapter import analyze_audio
from make_record import make_qr_data_url, make_record


app = FastAPI(title="VoiceGuard Backend V2.1")
FRONTEND_DIR = Path(__file__).resolve().parents[1] / "frontend"


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/analyze")
async def analyze(audio: UploadFile = File(...)):
    original_path = None
    normalized_path = None

    try:
        suffix = Path(audio.filename or "").suffix.lower()
        if len(suffix) > 16:
            suffix = ""

        bytes_written = 0
        with tempfile.NamedTemporaryFile(
            prefix="voiceguard_upload_",
            suffix=suffix,
            delete=False,
        ) as temp_file:
            original_path = Path(temp_file.name)

            while chunk := await audio.read(1024 * 1024):
                temp_file.write(chunk)
                bytes_written += len(chunk)

        if bytes_written == 0:
            raise HTTPException(
                status_code=400,
                detail="Uploaded audio file is empty.",
            )

        normalized_path = normalize_audio(original_path)
        analysis_result = analyze_audio(normalized_path)
        record_result = {
            "risk_level": analysis_result["risk_level"],
            "message": analysis_result["message"],
        }
        verification_record = make_record(original_path, record_result)
        verification_qr = make_qr_data_url(verification_record)

        return {
            "analysis_mode": "local_model",
            "risk_level": analysis_result["risk_level"],
            "message": analysis_result["message"],
            "model_result": analysis_result["model_result"],
            "verification_record": verification_record,
            "verification_qr": verification_qr,
        }
    except UnsupportedAudioFormatError as error:
        raise HTTPException(status_code=415, detail=str(error)) from error
    except AudioDecodingError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except AudioNormalizationError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail="Audio processing failed.",
        ) from error
    finally:
        try:
            if normalized_path is not None:
                normalized_path.unlink(missing_ok=True)
        finally:
            try:
                if original_path is not None:
                    original_path.unlink(missing_ok=True)
            finally:
                await audio.close()


app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
