import base64
import hashlib
import json
from io import BytesIO
from datetime import datetime
from pathlib import Path

import qrcode


def make_record(audio_path, result):
    """Create a detection record and its checksum."""
    audio_bytes = Path(audio_path).read_bytes()
    audio_hash = hashlib.sha256(audio_bytes).hexdigest()

    record_data = {
        "audio_hash": audio_hash,
        "risk_level": result["risk_level"],
        "message": result["message"],
        "timestamp": datetime.now().astimezone().isoformat(timespec="seconds"),
    }

    serialized_record = json.dumps(record_data, sort_keys=True)
    record_hash = hashlib.sha256(serialized_record.encode("utf-8")).hexdigest()

    return {
        **record_data,
        "record_hash": record_hash,
    }


def save_record(record, output_path):
    """Save a complete record as readable JSON."""
    output_file = Path(output_path)
    output_file.parent.mkdir(parents=True, exist_ok=True)
    output_file.write_text(
        json.dumps(record, indent=4, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def make_qr(record, output_path):
    """Generate a QR code containing the JSON detection record."""
    output_file = Path(output_path)
    output_file.parent.mkdir(parents=True, exist_ok=True)
    qr_data = json.dumps(record, sort_keys=True, ensure_ascii=False)
    qr_image = qrcode.make(qr_data)
    qr_image.save(output_file)


def make_qr_data_url(record):
    """Return a PNG data URL containing the JSON detection record."""
    qr_data = json.dumps(record, sort_keys=True, ensure_ascii=False)
    qr_image = qrcode.make(qr_data)
    image_buffer = BytesIO()
    qr_image.save(image_buffer, format="PNG")
    encoded_image = base64.b64encode(image_buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded_image}"


if __name__ == "__main__":
    audio_path = "test_audio/fake01_davinci.mp3"
    mock_result = {
        "risk_level": "HIGH_SUSPICION",
        "message": "Strong signs of AI-generated speech were detected.",
    }

    verification_record = make_record(audio_path, mock_result)
    print(json.dumps(verification_record, indent=4, ensure_ascii=False))
    save_record(verification_record, "outputs/verification_record.json")
    make_qr(verification_record, "outputs/verification_qr.png")
