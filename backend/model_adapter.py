import os
import sys
from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parents[1]
MIMI_MODEL_DIR = Path(
    os.environ.get("VOICEGUARD_MIMI_MODEL_DIR", PROJECT_DIR / "model")
).expanduser().resolve()

if not MIMI_MODEL_DIR.is_dir():
    raise RuntimeError(
        "Mimi model directory was not found. Place it in ./model or set "
        "VOICEGUARD_MIMI_MODEL_DIR to the local Mimi runtime directory."
    )

model_dir_string = str(MIMI_MODEL_DIR)
if model_dir_string not in sys.path:
    sys.path.insert(0, model_dir_string)

from detect import detect as mimi_detect


RISK_MAPPING = {
    "FAKE": {
        "risk_level": "HIGH_SUSPICION",
        "message": "Strong signs of AI-generated speech were detected.",
    },
    "UNCERTAIN": {
        "risk_level": "UNCERTAIN",
        "message": "The system cannot make a reliable assessment of this audio.",
    },
    "REAL": {
        "risk_level": "LOW_SUSPICION",
        "message": "No strong AI-generated characteristics were detected.",
    },
}


def analyze_audio(audio_path):
    """Run Mimi's local detector and map its verdict to VoiceGuard fields."""
    result = mimi_detect(str(Path(audio_path)))
    verdict = result.get("verdict")

    if verdict not in RISK_MAPPING:
        raise ValueError(f"Unexpected model verdict: {verdict!r}")

    mapped_result = RISK_MAPPING[verdict]
    return {
        "risk_level": mapped_result["risk_level"],
        "message": mapped_result["message"],
        "model_result": {
            "verdict": verdict,
            "fake_probability": result["fake_probability"],
            "bonafide_score": result["bonafide_score"],
        },
    }
