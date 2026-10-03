import shutil
import subprocess
import tempfile
from pathlib import Path


SUPPORTED_EXTENSIONS = frozenset({".wav", ".mp3", ".m4a", ".webm", ".flac", ".ogg"})
FFMPEG_TIMEOUT_SECONDS = 120


class UnsupportedAudioFormatError(ValueError):
    pass


class AudioDecodingError(ValueError):
    pass


class AudioNormalizationError(RuntimeError):
    pass


def _remove_output(path):
    if path is not None:
        path.unlink(missing_ok=True)


def normalize_audio(input_path):
    """Normalize a supported local audio file to mono 16 kHz PCM WAV."""
    input_file = Path(input_path)
    extension = input_file.suffix.lower()

    if extension not in SUPPORTED_EXTENSIONS:
        raise UnsupportedAudioFormatError(
            "Supported audio formats are WAV, MP3, M4A, WebM, FLAC, and OGG."
        )

    ffmpeg_path = shutil.which("ffmpeg")
    if ffmpeg_path is None:
        raise AudioNormalizationError("Local ffmpeg executable was not found.")

    normalized_path = None
    keep_output = False
    try:
        with tempfile.NamedTemporaryFile(
            prefix="voiceguard_normalized_",
            suffix=".wav",
            delete=False,
        ) as normalized_file:
            normalized_path = Path(normalized_file.name)

        command = [
            ffmpeg_path,
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(input_file),
            "-map",
            "0:a:0",
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-c:a",
            "pcm_s16le",
            "-f",
            "wav",
            str(normalized_path),
        ]

        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=FFMPEG_TIMEOUT_SECONDS,
            check=False,
        )

        if completed.returncode != 0:
            error_lines = [
                line.strip() for line in completed.stderr.splitlines() if line.strip()
            ]
            ffmpeg_error = error_lines[-1] if error_lines else "Unknown decoding error."
            raise AudioDecodingError(
                f"Uploaded audio is corrupt or unreadable: {ffmpeg_error}"
            )

        if normalized_path.stat().st_size == 0:
            raise AudioDecodingError("Uploaded audio produced an empty decoded file.")

        keep_output = True
        return normalized_path
    except subprocess.TimeoutExpired as error:
        raise AudioDecodingError("Audio decoding timed out.") from error
    except AudioDecodingError:
        raise
    except OSError as error:
        raise AudioNormalizationError("Local audio normalization failed.") from error
    finally:
        if normalized_path is not None and not keep_output:
            _remove_output(normalized_path)
