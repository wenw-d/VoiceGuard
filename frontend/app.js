const ANALYZE_ENDPOINT = "/analyze";

const RECORDING_FORMATS = [
  { mimeType: "audio/webm;codecs=opus", extension: ".webm", label: "WebM (Opus)" },
  { mimeType: "audio/webm", extension: ".webm", label: "WebM" },
  { mimeType: "audio/mp4;codecs=mp4a.40.2", extension: ".m4a", label: "M4A (AAC)" },
  { mimeType: "audio/mp4", extension: ".m4a", label: "M4A" },
  { mimeType: "audio/ogg;codecs=opus", extension: ".ogg", label: "OGG (Opus)" },
  { mimeType: "audio/ogg", extension: ".ogg", label: "OGG" }
];

const RESULT_STATES = {
  LOW_SUSPICION: {
    kind: "real",
    accent: "safe",
    status: "Low suspicion",
    title: "Low Suspicion",
    cardClass: "safe-card",
    guidance: [
      "No strong AI-generated characteristics were detected. This does not prove that the audio is authentic.",
      "Remain cautious with sensitive requests.",
      "Verify independently before acting on money or identity requests."
    ]
  },
  UNCERTAIN: {
    kind: "uncertain",
    accent: "warning",
    status: "Inconclusive",
    title: "Result Uncertain",
    explanation: "The audio does not show enough clear evidence for a reliable assessment.",
    cardClass: "warning-card",
    guidance: [
      "This is a valid screening result, not a system error.",
      "Verify the request through another trusted channel before taking action.",
      "Do not rely on this audio alone.",
      "Avoid urgent transfers or sharing verification codes."
    ]
  },
  HIGH_SUSPICION: {
    kind: "high-risk",
    accent: "danger",
    status: "High suspicion",
    title: "High Suspicion",
    cardClass: "danger-card",
    guidance: [
      "Do not act on urgent financial or sensitive requests until you verify the speaker through a trusted channel.",
      "Do not rely on this audio alone.",
      "Keep the recording and related messages as evidence."
    ]
  }
};

let currentScreen = "home";
let currentResult = null;
let homeNotice = "";
let analysisTimers = [];
let mediaRecorder = null;
let recordingStream = null;
let recordingChunks = [];
let recordingFormat = null;
let recordingStartedAt = 0;
let recordingTimer = null;
let recordingFailed = false;

function clearAnalysisTimers() {
  analysisTimers.forEach(window.clearTimeout);
  analysisTimers = [];
}

function clearRecordingTimer() {
  if (recordingTimer !== null) {
    window.clearInterval(recordingTimer);
    recordingTimer = null;
  }
}

function releaseMicrophone() {
  if (recordingStream) {
    recordingStream.getTracks().forEach(track => track.stop());
    recordingStream = null;
  }
}

function show(screen) {
  clearAnalysisTimers();
  currentScreen = screen;
  render();
}

function logo() {
  return '<div class="brand"><span class="brand-mark" aria-hidden="true">⌁</span><span>VoiceGuard</span></div>';
}

function render() {
  const app = document.getElementById("app");

  if (currentScreen === "home") {
    app.innerHTML = `
      <section class="screen home-screen">
        ${logo()}
        <div class="home-content">
          <p class="eyebrow">Audio safety, simplified</p>
          <h1>Hear the warning.<br>Verify the voice.</h1>
          <p class="lede">Check suspicious audio for signs of AI-generated speech before you decide what to do next.</p>
        </div>
        <div class="home-actions">
          <input id="audio-input" class="visually-hidden" type="file" accept=".wav,.mp3,.m4a,.webm,.flac,.ogg,audio/wav,audio/mpeg,audio/mp4,audio/webm,audio/flac,audio/ogg" onchange="handleAudioSelection(event)">
          <div class="actions">
            <button class="button" onclick="document.getElementById('audio-input').click()">Upload audio</button>
            <button class="button secondary" onclick="startRecording()">Record audio</button>
          </div>
          <p class="hint">Upload a supported audio file or record with your microphone. Audio stays on the local VoiceGuard service.</p>
          ${homeNotice ? '<p id="home-notice" class="home-notice" role="alert"></p>' : ""}
        </div>
      </section>`;

    if (homeNotice) {
      document.getElementById("home-notice").textContent = homeNotice;
    }
  } else if (currentScreen === "recording") {
    app.innerHTML = `
      <section class="screen">
        ${logo()}
        <div class="recording-content">
          <div class="recording-indicator" aria-hidden="true"><span></span></div>
          <p class="eyebrow recording-status">Recording…</p>
          <h1 id="recording-timer" class="recording-timer">00:00</h1>
          <p class="muted">Speak naturally, then stop when your sample is ready.</p>
          <p id="recording-format" class="recording-format"></p>
          <button id="stop-recording" class="button recording-stop" onclick="stopRecordingAndAnalyze()">Stop &amp; Analyze</button>
        </div>
      </section>`;

    document.getElementById("recording-format").textContent = `Recording format: ${recordingFormat.label}`;
  } else if (currentScreen === "analyzing") {
    app.innerHTML = `
      <section class="screen">
        ${logo()}
        <div class="analyzing-content">
          <div class="scan" aria-hidden="true"></div>
          <p class="eyebrow">Analysis in progress</p>
          <h1>Analyzing audio…</h1>
          <p class="muted">Screening voice characteristics with the local model.</p>
          <div class="progress-track" aria-label="Interface progress animation while analysis runs"><div id="progress" class="progress" style="width: 16%"></div></div>
          <p id="progress-label" class="muted">Preparing audio…</p>
          <div class="steps">
            <div class="step done"><span class="step-icon">✓</span>Preparing audio</div>
            <div class="step active"><span class="step-icon">⌁</span>Analyzing voice characteristics</div>
            <div class="step"><span class="step-icon">○</span>Generating safety result</div>
          </div>
        </div>
      </section>`;
    animateAnalysis();
  } else {
    renderResult(app);
  }
}

function renderResult(app) {
  const state = RESULT_STATES[currentResult.riskLevel];

  app.innerHTML = `
    <section class="screen">
      ${logo()}
      <div class="result-content">
        <span id="result-status" class="status-pill ${state.accent}"></span>
        <h2 id="result-title"></h2>
        <p id="result-message" class="result-message"></p>
        <div class="advice-card ${state.cardClass}">
          <div class="card-title">Safety guidance</div>
          <ul id="advice-list" class="advice-list"></ul>
        </div>
        <div class="record-card" aria-label="VoiceGuard verification record">
          <img id="verification-qr" class="verification-qr" alt="QR code containing the local verification record">
          <div class="record-body">
            <div class="record-title">Local Verification Record</div>
            <dl class="record-fields">
              <div><dt>Timestamp</dt><dd id="record-timestamp"></dd></div>
              <div><dt id="record-risk-label">Risk level</dt><dd id="record-risk"></dd></div>
              <div><dt>Audio SHA-256</dt><dd><code id="audio-hash-short"></code></dd></div>
              <div><dt>Record SHA-256</dt><dd><code id="record-hash-short"></code></dd></div>
            </dl>
            <details class="record-details">
              <summary>View full hashes</summary>
              <div><strong>Audio SHA-256</strong><code id="audio-hash-full"></code></div>
              <div><strong>Record SHA-256</strong><code id="record-hash-full"></code></div>
            </details>
          </div>
        </div>
        <button class="button quiet" onclick="resetApp()">Test another</button>
      </div>
    </section>`;

  document.getElementById("result-status").textContent = state.status;
  document.getElementById("result-title").textContent = state.title;
  document.getElementById("result-message").textContent = state.explanation || currentResult.message;

  const adviceList = document.getElementById("advice-list");
  state.guidance.forEach(item => {
    const listItem = document.createElement("li");
    listItem.textContent = item;
    adviceList.appendChild(listItem);
  });

  document.getElementById("record-timestamp").textContent = currentResult.record.timestamp;
  const isUncertain = currentResult.riskLevel === "UNCERTAIN";
  document.getElementById("record-risk-label").textContent = isUncertain ? "Screening result" : "Risk level";
  document.getElementById("record-risk").textContent = isUncertain ? "INCONCLUSIVE" : currentResult.record.risk_level;
  document.getElementById("audio-hash-short").textContent = shortenHash(currentResult.record.audio_hash);
  document.getElementById("record-hash-short").textContent = shortenHash(currentResult.record.record_hash);
  document.getElementById("audio-hash-full").textContent = currentResult.record.audio_hash;
  document.getElementById("record-hash-full").textContent = currentResult.record.record_hash;
  document.getElementById("verification-qr").src = currentResult.verificationQr;
}

function shortenHash(hash) {
  return `${hash.slice(0, 12)}…${hash.slice(-12)}`;
}

function handleAudioSelection(event) {
  const [audioFile] = event.target.files;
  event.target.value = "";
  if (!audioFile) return;

  homeNotice = "";
  startAnalysis(audioFile);
}

function chooseRecordingFormat() {
  if (!window.MediaRecorder || typeof MediaRecorder.isTypeSupported !== "function") {
    return null;
  }

  return RECORDING_FORMATS.find(format => MediaRecorder.isTypeSupported(format.mimeType)) || null;
}

async function startRecording() {
  homeNotice = "";

  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function" || !window.MediaRecorder) {
    homeNotice = "This browser does not support microphone recording. Please upload an audio file instead.";
    render();
    return;
  }

  recordingFormat = chooseRecordingFormat();
  if (!recordingFormat) {
    homeNotice = "This browser cannot record in a supported audio format. Please upload an audio file instead.";
    render();
    return;
  }

  homeNotice = "Waiting for microphone permission…";
  render();

  try {
    recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(recordingStream, { mimeType: recordingFormat.mimeType });
    recordingChunks = [];
    recordingFailed = false;

    mediaRecorder.addEventListener("dataavailable", event => {
      if (event.data && event.data.size > 0) recordingChunks.push(event.data);
    });
    mediaRecorder.addEventListener("error", () => {
      failRecording("Recording failed. Please check your microphone and try again.");
    });
    mediaRecorder.addEventListener("stop", finishRecording);

    mediaRecorder.start(1000);
    recordingStartedAt = Date.now();
    homeNotice = "";
    show("recording");
    updateRecordingTimer();
    recordingTimer = window.setInterval(updateRecordingTimer, 250);
  } catch (error) {
    releaseMicrophone();
    mediaRecorder = null;
    homeNotice = microphoneErrorMessage(error);
    show("home");
  }
}

function microphoneErrorMessage(error) {
  if (error && (error.name === "NotAllowedError" || error.name === "SecurityError")) {
    return "Microphone permission was denied. Allow microphone access or upload an audio file instead.";
  }
  if (error && (error.name === "NotFoundError" || error.name === "DevicesNotFoundError")) {
    return "No microphone was found. Connect a microphone or upload an audio file instead.";
  }
  if (error && (error.name === "NotReadableError" || error.name === "TrackStartError")) {
    return "The microphone is unavailable or already in use. Close other audio apps and try again.";
  }
  return "VoiceGuard could not start recording. Please try again or upload an audio file.";
}

function updateRecordingTimer() {
  const timer = document.getElementById("recording-timer");
  if (!timer) return;

  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - recordingStartedAt) / 1000));
  const minutes = Math.floor(elapsedSeconds / 60).toString().padStart(2, "0");
  const seconds = (elapsedSeconds % 60).toString().padStart(2, "0");
  timer.textContent = `${minutes}:${seconds}`;
}

function stopRecordingAndAnalyze() {
  if (!mediaRecorder || mediaRecorder.state === "inactive") return;

  const stopButton = document.getElementById("stop-recording");
  if (stopButton) {
    stopButton.disabled = true;
    stopButton.textContent = "Preparing recording…";
  }

  clearRecordingTimer();
  try {
    mediaRecorder.stop();
  } catch (error) {
    failRecording("Recording could not be stopped. Please try again.");
  }
}

function finishRecording() {
  clearRecordingTimer();
  releaseMicrophone();

  if (recordingFailed) return;

  const actualMimeType = mediaRecorder.mimeType || recordingChunks.find(chunk => chunk.type)?.type || recordingFormat.mimeType;
  const actualFormat = recordingFormatForMimeType(actualMimeType);
  const recordedBlob = new Blob(recordingChunks, { type: actualMimeType });
  mediaRecorder = null;
  recordingChunks = [];

  if (!actualFormat) {
    homeNotice = "The browser produced an unsupported recording format. Please upload an audio file instead.";
    show("home");
    return;
  }

  if (recordedBlob.size === 0) {
    homeNotice = "No audio was captured. Please check your microphone and record again.";
    show("home");
    return;
  }

  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
  const recordedFile = new File(
    [recordedBlob],
    `voiceguard-recording-${timestamp}${actualFormat.extension}`,
    { type: actualMimeType }
  );
  recordingFormat = actualFormat;
  startAnalysis(recordedFile);
}

function recordingFormatForMimeType(mimeType) {
  const normalizedMimeType = String(mimeType || "").toLowerCase();
  if (normalizedMimeType.startsWith("audio/webm")) {
    return { mimeType, extension: ".webm", label: normalizedMimeType.includes("opus") ? "WebM (Opus)" : "WebM" };
  }
  if (normalizedMimeType.startsWith("audio/mp4")) {
    return { mimeType, extension: ".m4a", label: "M4A" };
  }
  if (normalizedMimeType.startsWith("audio/ogg")) {
    return { mimeType, extension: ".ogg", label: normalizedMimeType.includes("opus") ? "OGG (Opus)" : "OGG" };
  }
  return null;
}

function failRecording(message) {
  if (recordingFailed) return;
  recordingFailed = true;
  clearRecordingTimer();
  releaseMicrophone();

  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    try {
      mediaRecorder.stop();
    } catch (error) {
      // The recorder is already unusable; returning home remains the safe fallback.
    }
  }

  mediaRecorder = null;
  recordingChunks = [];
  homeNotice = message;
  show("home");
}

async function startAnalysis(audioFile) {
  show("analyzing");
  const formData = new FormData();
  formData.append("audio", audioFile, audioFile.name);

  try {
    const response = await fetch(ANALYZE_ENDPOINT, { method: "POST", body: formData });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(readErrorMessage(payload));
    }

    currentResult = presentResult(payload);
    show(currentResult.kind === "uncertain" ? "uncertain" : "result");
  } catch (error) {
    homeNotice = error.message || "Unable to connect to the local analysis service.";
    show("home");
  }
}

function readErrorMessage(payload) {
  if (typeof payload.detail === "string" && payload.detail.trim()) {
    return payload.detail;
  }

  if (Array.isArray(payload.detail)) {
    const messages = payload.detail
      .map(item => item && item.msg)
      .filter(Boolean);
    if (messages.length) return messages.join(" ");
  }

  if (typeof payload.error === "string" && payload.error.trim()) {
    return payload.error;
  }

  return "The analysis service could not process this audio.";
}

function presentResult(payload) {
  const riskLevel = String(payload.risk_level || "").toUpperCase();
  const message = String(payload.message || "").trim();
  const record = payload.verification_record;
  const verificationQr = String(payload.verification_qr || "");

  if (!Object.hasOwn(RESULT_STATES, riskLevel) || !message) {
    throw new Error("The analysis service returned an invalid result.");
  }

  if (!record || typeof record !== "object") {
    throw new Error("The analysis service did not return a verification record.");
  }

  const requiredRecordFields = ["timestamp", "audio_hash", "record_hash", "risk_level"];
  const hasCompleteRecord = requiredRecordFields.every(field =>
    typeof record[field] === "string" && record[field].trim()
  );
  if (!hasCompleteRecord) {
    throw new Error("The verification record is incomplete.");
  }

  if (!verificationQr.startsWith("data:image/png;base64,")) {
    throw new Error("The analysis service did not return a valid verification QR code.");
  }

  return {
    kind: RESULT_STATES[riskLevel].kind,
    riskLevel,
    message,
    record,
    verificationQr
  };
}

function animateAnalysis() {
  const progress = document.getElementById("progress");
  const label = document.getElementById("progress-label");
  const stages = [
    [42, "Preparing audio…"],
    [74, "Analyzing voice characteristics…"],
    [88, "Generating safety result…"]
  ];

  stages.forEach(([value, text], index) => {
    analysisTimers.push(window.setTimeout(() => {
      if (progress) progress.style.width = `${value}%`;
      if (label) label.textContent = text;
    }, 420 * (index + 1)));
  });
}

function resetApp() {
  clearRecordingTimer();
  releaseMicrophone();
  mediaRecorder = null;
  recordingChunks = [];
  recordingFormat = null;
  recordingFailed = false;
  currentResult = null;
  homeNotice = "";
  show("home");
}

render();
