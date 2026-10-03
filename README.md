# VoiceGuard

VoiceGuard is a privacy-first AI voice deepfake risk-screening system designed to perform first-line screening locally, including operation without an Internet connection.

VoiceGuard is a screening assistant, **not a truth detector**. Its output should support cautious verification, never replace independent evidence or human judgment.

## Overview

VoiceGuard accepts an uploaded audio file or a new browser microphone recording, normalizes it locally, runs Mimi's speech deepfake detector, and presents a clear screening result. Each result includes a local verification record and QR code.

## Problem

Synthetic speech can make impersonation, fraud, and social-engineering attempts more convincing. Many detection services require users to upload sensitive recordings to a remote service, which creates privacy and connectivity barriers.

## Solution

VoiceGuard provides fast first-line screening through a local web interface. The frontend, audio conversion, model inference, risk mapping, record generation, and QR generation can all run on the same computer without sending audio to a cloud service.

## Key Features

- Local Mimi model inference
- Upload and browser microphone recording
- WAV, MP3, M4A, WebM, FLAC, and OGG support
- Three clear screening states
- Local verification record with SHA-256 checksums
- QR code containing the verification record
- Temporary-file cleanup after every request
- No external frontend libraries or runtime web services
- Offline operation after dependencies and model files are installed

## Architecture

```text
Browser frontend
    -> FastAPI POST /analyze
    -> local ffmpeg normalization
    -> Mimi deepfake model
    -> risk mapping
    -> verification record
    -> QR generation
    -> result UI
```

The frontend is served by the same FastAPI application, so normal operation uses only the local VoiceGuard service.

## Supported Audio Formats

- WAV
- MP3
- M4A
- WebM
- FLAC
- OGG

Accepted inputs are converted locally to mono, 16 kHz PCM WAV before model inference.

## Screening Results

- `LOW_SUSPICION`: no strong AI-generated characteristics were detected.
- `UNCERTAIN`: the audio does not contain enough clear evidence for a reliable assessment. The UI presents this as **Inconclusive**, a valid screening result rather than a system error.
- `HIGH_SUSPICION`: strong signs of AI-generated speech were detected.

These categories are risk-screening outputs. Any internal model score is model-specific and must not be interpreted as a calibrated probability that a recording is true or false.

## Browser Recording

Browser recording uses the native `MediaRecorder` and `getUserMedia()` APIs. VoiceGuard selects a backend-compatible browser format, gives WebM recordings a `.webm` filename and MP4 recordings a `.m4a` filename, and submits the result through the same multipart `POST /analyze` endpoint used for uploaded files.

Microphone recordings and uploaded files therefore use the same normalization, inference, result, verification-record, and QR pipeline.

## Local / Offline Operation

VoiceGuard can process audio entirely locally. It uses local HTML, CSS, JavaScript, ffmpeg, Python packages, Mimi model files, and an XLS-R backbone. Once those dependencies and model artifacts are installed, normal inference does not require Internet access.

For an explicit offline run, set both Hugging Face offline flags as shown in [Running Locally](#running-locally). The model integration also requests local files only.

Original uploads, browser recordings, and normalized WAV files are temporary. The backend removes them after processing, including when processing fails.

## Verification Record

Each successful analysis returns a verification record containing:

- the screening result and user-facing backend message;
- a timestamp;
- `audio_hash`, the SHA-256 hash of the **original uploaded or recorded input bytes**;
- `record_hash`, a SHA-256 checksum of the serialized record.

`record_hash` is an integrity checksum, **not a digital signature** and not proof of authorship. The QR code encodes the verification record locally; it does not call a remote QR service.

## Project Structure

```text
VoiceGuard/
├── backend/
│   ├── __init__.py
│   ├── app.py
│   ├── audio_normalizer.py
│   └── model_adapter.py
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── make_record.py
├── requirements.txt
├── .gitignore
└── README.md
```

Large model artifacts, virtual environments, generated output, caches, and test audio are intentionally excluded from the public repository.

## Installation

Prerequisites:

- Python 3.11
- `ffmpeg` available on `PATH`
- Local Mimi detector files and model weights
- Local XLS-R backbone files required by the detector

Create an isolated environment and install the Python dependencies:

```bash
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

Install ffmpeg with the package manager for your operating system. For example, on macOS with Homebrew:

```bash
brew install ffmpeg
```

## Running Locally

If the Mimi runtime is not in `./model`, point VoiceGuard to its local directory:

```bash
export VOICEGUARD_MIMI_MODEL_DIR=/absolute/path/to/mimi-model
```

Start VoiceGuard in explicit offline mode:

```bash
HF_HUB_OFFLINE=1 \
TRANSFORMERS_OFFLINE=1 \
uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

Open [http://127.0.0.1:8000/](http://127.0.0.1:8000/) in a browser. Microphone recording requires browser permission.

## Model Setup

Model weights are intentionally excluded from GitHub because they are large local artifacts. No unverified model download link is provided here.

Obtain the approved Mimi runtime, detector checkpoint, and XLS-R backbone from the project team. Place the importable Mimi runtime in `./model` or set `VOICEGUARD_MIMI_MODEL_DIR` to its directory. That directory must contain the detector module expected by `backend/model_adapter.py` and all local files expected by the existing Mimi implementation.

Do not commit checkpoints, `.safetensors`, PyTorch weights, large `.bin` files, or Hugging Face caches. The repository's `.gitignore` excludes these artifacts.

## Limitations

- VoiceGuard provides a risk indication, not definitive authentication.
- Detection quality depends on recording quality, compression, noise, language, speaker characteristics, and threats represented in the model's training data.
- Adversarial or previously unseen synthesis techniques may evade detection.
- Long audio currently follows the Mimi model's existing preprocessing and fixed-window behavior; VoiceGuard does not aggregate predictions across an entire long recording.
- An inconclusive result means the evidence was insufficient and should not be treated as an error or a safe verdict.
- The local verification record is not cryptographically signed.

## Responsible Use

Use VoiceGuard as one signal in a broader verification process. Confirm urgent financial, identity, or safety-related requests through a separate trusted channel. Do not use a screening result as the sole basis for accusing, penalizing, or identifying a person.

## HacKU 2026 Team

VoiceGuard was created by the VoiceGuard team for HacKU 2026.
