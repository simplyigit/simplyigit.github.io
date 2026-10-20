import { initAmbientMesh, initGlobalReveal, initGlassParallax } from '../modules/core.js';

const PRESET_SAMPLES = {
    real: {
        file: "dataset/t_images/celeba_real_042.jpg",
        prediction: "REAL",
        badgeClass: "verdict-real",
        probs: { real: 96.4, ai: 3.4, df: 0.2 },
        l2Norm: "18.42",
        freqNote: "Natural sensor noise · isotropic high-freq decay",
        seed: 11,
        palette: ["#10b981", "#059669", "#34d399"]
    },
    ai: {
        file: "dataset/t_images/nano_banana_synth.jpg",
        prediction: "AI FAKE",
        badgeClass: "verdict-ai",
        probs: { real: 4.9, ai: 94.8, df: 0.3 },
        l2Norm: "23.17",
        freqNote: "Diffusion spectral roll-off · periodic grid peaks",
        seed: 42,
        palette: ["#f59e0b", "#d97706", "#fbbf24"]
    },
    deepfake: {
        file: "dataset/t_images/ffpp_face2face_19.jpg",
        prediction: "DEEPFAKE",
        badgeClass: "verdict-df",
        probs: { real: 0.3, ai: 0.6, df: 99.1 },
        l2Norm: "26.85",
        freqNote: "Blending boundary discontinuity · H.264 warp",
        seed: 77,
        palette: ["#ef4444", "#dc2626", "#f87171"]
    }
};

function sanitizeProjectHtml(html) {
    if (!html) return '';
    return html
        .replace(/src="images\//g, 'src="')
        .replace(
            /<td[^>]*>\\multicolumn\{(\d+)\}\{[a-z]\}\{(.*?)\}<\/td>(?:\s*<td[^>]*><\/td>){0,4}/gi,
            '<td colspan="$1" style="text-align: center;">$2</td>'
        )
        .replace(/\\multicolumn\{\d+\}\{[a-z]\}\{\*\*(.*?)\*\*\s*(.*?)\}/g, '<strong>$1</strong> $2')
        .replace(/\\multicolumn\{\d+\}\{[a-z]\}\{(.*?)\}/g, '$1');
}

function loadProjectReadme() {
    const container = document.getElementById("github-content");
    if (!container) return;

    const repoPath = "simplyigit/Real-Deepfake-or-AI";
    const repoName = "Real-Deepfake-or-AI";
    const CACHE_KEY = "simplyigit_project_v2_" + repoName;

    try {
        const cachedData = localStorage.getItem(CACHE_KEY);
        if (cachedData) {
            container.innerHTML = cachedData;
        }
    } catch {}

    const applyContent = (rawContent) => {
        const clean = sanitizeProjectHtml(rawContent);
        if (!clean) return false;
        container.innerHTML = clean;
        try {
            localStorage.setItem(CACHE_KEY, clean);
        } catch {}
        return true;
    };

    const fetchProjectData = async () => {
        // 1. Edge-cached /api/projects (<20ms SWR)
        try {
            const apiRes = await fetch("/api/projects");
            if (apiRes.ok) {
                const json = await apiRes.json();
                if (json.success && json.data) {
                    const content = json.data[repoPath] || json.data[repoName];
                    if (content) return content;
                }
            }
        } catch {}

        // 2. Static snapshot fallback
        try {
            const staticRes = await fetch("/data/projects.json");
            if (staticRes.ok) {
                const json = await staticRes.json();
                if (json.success && json.data) {
                    const content = json.data[repoPath] || json.data[repoName];
                    if (content) return content;
                }
            }
        } catch {}

        return null;
    };

    fetchProjectData().then(content => {
        if (content) {
            applyContent(content);
        } else if (!container.innerHTML || container.innerHTML.includes("Loading project data")) {
            container.innerHTML = `<p style="color: #ff6b6b;">Could not load project README. Please check the repository link above.</p>`;
        }
    });
}

function drawPresetSample(canvas, type, preset) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Dark studio backdrop gradient
    const bgGrad = ctx.createRadialGradient(w * 0.5, h * 0.42, 12, w * 0.5, h * 0.5, w * 0.72);
    if (type === 'real') {
        bgGrad.addColorStop(0, '#16302b');
        bgGrad.addColorStop(1, '#070d14');
    } else if (type === 'ai') {
        bgGrad.addColorStop(0, '#332410');
        bgGrad.addColorStop(1, '#090b12');
    } else {
        bgGrad.addColorStop(0, '#361419');
        bgGrad.addColorStop(1, '#090b12');
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Subtle spatial grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    for (let x = 28; x < w; x += 28) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 28; y < h; y += 28) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Stylized biometric head/shoulders silhouette & feature landmarks
    const cx = w / 2;
    const cy = h * 0.44;
    ctx.save();

    // Shoulders
    ctx.beginPath();
    ctx.ellipse(cx, h * 0.94, 68, 38, 0, Math.PI, 0, false);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.stroke();

    // Head contour
    ctx.beginPath();
    ctx.ellipse(cx, cy, 42, 54, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.fill();
    ctx.strokeStyle = preset.palette[0];
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Feature attention heatmap overlays specific to class signature
    if (type === 'real') {
        // Organic facial landmark mesh
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.45)';
        ctx.lineWidth = 1;
        const pts = [
            [cx - 16, cy - 8], [cx + 16, cy - 8],
            [cx, cy + 6], [cx - 14, cy + 22], [cx + 14, cy + 22],
            [cx, cy - 26], [cx - 28, cy + 2], [cx + 28, cy + 2]
        ];
        pts.forEach(([px, py], i) => {
            pts.slice(i + 1).forEach(([qx, qy]) => {
                if (Math.hypot(px - qx, py - qy) < 42) {
                    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(qx, qy); ctx.stroke();
                }
            });
        });
        pts.forEach(([px, py]) => {
            ctx.fillStyle = '#34d399';
            ctx.beginPath(); ctx.arc(px, py, 2.2, 0, Math.PI * 2); ctx.fill();
        });
    } else if (type === 'ai') {
        // High-frequency diffusion checkerboard/spectral ring anomalies
        for (let r = 16; r <= 64; r += 16) {
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
            ctx.setLineDash([4, 4]);
            ctx.stroke();
        }
        ctx.setLineDash([]);
        // Eye/background symmetry artifacts
        ctx.fillStyle = 'rgba(245, 158, 11, 0.28)';
        ctx.beginPath(); ctx.arc(cx - 16, cy - 8, 9, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + 16, cy - 8, 9, 0, Math.PI * 2); ctx.fill();
    } else {
        // Deepfake inner-face splice boundary box & warp vectors
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 3]);
        ctx.strokeRect(cx - 32, cy - 34, 64, 72);
        ctx.setLineDash([]);

        // Blending seam hotspot around jaw/mouth
        const seamGrad = ctx.createRadialGradient(cx, cy + 20, 4, cx, cy + 20, 28);
        seamGrad.addColorStop(0, 'rgba(239, 68, 68, 0.45)');
        seamGrad.addColorStop(1, 'rgba(239, 68, 68, 0)');
        ctx.fillStyle = seamGrad;
        ctx.beginPath(); ctx.arc(cx, cy + 20, 28, 0, Math.PI * 2); ctx.fill();
    }

    // Corner crop brackets (224x224 center-crop frame)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 2;
    const m = 12, len = 14;
    // Top-left
    ctx.beginPath(); ctx.moveTo(m, m + len); ctx.lineTo(m, m); ctx.lineTo(m + len, m); ctx.stroke();
    // Top-right
    ctx.beginPath(); ctx.moveTo(w - m - len, m); ctx.lineTo(w - m, m); ctx.lineTo(w - m, m + len); ctx.stroke();
    // Bottom-left
    ctx.beginPath(); ctx.moveTo(m, h - m - len); ctx.lineTo(m, h - m); ctx.lineTo(m + len, h - m); ctx.stroke();
    // Bottom-right
    ctx.beginPath(); ctx.moveTo(w - m - len, h - m); ctx.lineTo(w - m, h - m); ctx.lineTo(w - m, h - m - len); ctx.stroke();

    ctx.restore();
}

// --- Client-Side Security, File Validation & Upload Rate Limiter ---
const ALLOWED_EXTENSIONS = /\.(jpe?g|png|webp)$/i;
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_DIMENSION = 8192;
const MIN_DIMENSION = 16;

const RL_STORAGE_KEY = 'simplyigit_detector_rl_v1';
const RL_COOLDOWN_MS = 3000;       // 3 seconds between uploads
const RL_WINDOW_MS = 60 * 1000;    // 60 seconds rolling window
const RL_MAX_UPLOADS = 8;          // Max 8 uploads per 60s window
let memoryUploadTimestamps = [];
let lastUploadTimestamp = 0;

function sanitizeFileName(name) {
    if (!name || typeof name !== 'string') return 'upload.jpg';
    return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 48);
}

function getUploadTimestamps() {
    const now = Date.now();
    let list = memoryUploadTimestamps;
    try {
        const raw = sessionStorage.getItem(RL_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) list = parsed;
        }
    } catch {}
    const valid = list.filter(ts => typeof ts === 'number' && (now - ts) < RL_WINDOW_MS);
    memoryUploadTimestamps = valid;
    try {
        sessionStorage.setItem(RL_STORAGE_KEY, JSON.stringify(valid));
    } catch {}
    return valid;
}

function checkRateLimit() {
    const now = Date.now();
    if (now - lastUploadTimestamp < RL_COOLDOWN_MS) {
        const waitSec = Math.ceil((RL_COOLDOWN_MS - (now - lastUploadTimestamp)) / 1000);
        return { allowed: false, reason: `Cooldown active. Please wait ${waitSec}s before uploading another image.`, waitMs: RL_COOLDOWN_MS - (now - lastUploadTimestamp) };
    }
    const timestamps = getUploadTimestamps();
    if (timestamps.length >= RL_MAX_UPLOADS) {
        const oldest = timestamps[0];
        const waitMs = Math.max(1000, RL_WINDOW_MS - (now - oldest));
        const waitSec = Math.ceil(waitMs / 1000);
        return { allowed: false, reason: `Rate limit reached (${RL_MAX_UPLOADS} scans / 60s). Please wait ${waitSec}s.`, waitMs };
    }
    return { allowed: true, reason: '', waitMs: 0 };
}

function recordUploadTimestamp() {
    const now = Date.now();
    lastUploadTimestamp = now;
    const timestamps = getUploadTimestamps();
    timestamps.push(now);
    memoryUploadTimestamps = timestamps;
    try {
        sessionStorage.setItem(RL_STORAGE_KEY, JSON.stringify(timestamps));
    } catch {}
}

async function validateImageFile(file) {
    if (!file) return { valid: false, error: 'No file selected.' };

    const name = file.name || '';
    if (!ALLOWED_EXTENSIONS.test(name)) {
        return { valid: false, error: 'Invalid file extension. Only .jpg, .jpeg, .png, and .webp are allowed.' };
    }

    if (file.type && !ALLOWED_MIMES.has(file.type.toLowerCase())) {
        return { valid: false, error: 'Invalid MIME type. Only JPEG, PNG, and WebP images are allowed.' };
    }

    if (file.size <= 0) {
        return { valid: false, error: 'Selected file is empty.' };
    }

    if (file.size > MAX_FILE_BYTES) {
        return { valid: false, error: `File exceeds 10 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB).` };
    }

    // Inspect magic bytes to prevent disguised payloads (e.g., SVG/HTML/executable renamed to .jpg)
    try {
        const buf = await file.slice(0, 12).arrayBuffer();
        const b = new Uint8Array(buf);
        if (b.length < 12) {
            return { valid: false, error: 'Corrupted or truncated image header.' };
        }
        const isJpeg = b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF;
        const isPng = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 &&
                      b[4] === 0x0D && b[5] === 0x0A && b[6] === 0x1A && b[7] === 0x0A;
        const isWebp = b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
                       b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;

        if (!isJpeg && !isPng && !isWebp) {
            return { valid: false, error: 'File signature mismatch. Only genuine JPEG, PNG, and WebP binary headers are accepted.' };
        }

        const ext = name.split('.').pop().toLowerCase();
        if (((ext === 'jpg' || ext === 'jpeg') && !isJpeg) ||
            (ext === 'png' && !isPng) ||
            (ext === 'webp' && !isWebp)) {
            return { valid: false, error: `File extension (.${ext}) does not match its binary header signature.` };
        }
    } catch {
        return { valid: false, error: 'Could not read file header for security verification.' };
    }

    return { valid: true, error: '' };
}

// --- Real In-Browser Model Inference via ONNX Runtime Web ---
const ORT_CDN_URL = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/ort.min.js';
const ORT_WASM_DIR = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';
const MODEL_URL = '/assets/models/convnext_sgd_int8.onnx';
const MODEL_CACHE_NAME = 'simplyigit-detector-onnx-v1';

let ortSessionPromise = null;
let ortScriptPromise = null;

function loadOrtRuntime() {
    if (window.ort) return Promise.resolve(window.ort);
    if (ortScriptPromise) return ortScriptPromise;

    ortScriptPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = ORT_CDN_URL;
        script.async = true;
        script.crossOrigin = 'anonymous';
        script.onload = () => {
            if (window.ort) {
                window.ort.env.wasm.wasmPaths = ORT_WASM_DIR;
                window.ort.env.wasm.numThreads = 1;
                resolve(window.ort);
            } else {
                reject(new Error('ONNX Runtime Web failed to initialize.'));
            }
        };
        script.onerror = () => {
            ortScriptPromise = null;
            reject(new Error('Failed to load ONNX Runtime Web from CDN.'));
        };
        document.head.appendChild(script);
    });
    return ortScriptPromise;
}

async function fetchModelBufferWithCache(onProgress) {
    if ('caches' in window) {
        try {
            const cache = await caches.open(MODEL_CACHE_NAME);
            const cachedRes = await cache.match(MODEL_URL);
            if (cachedRes && cachedRes.ok) {
                if (onProgress) onProgress('Loading cached ConvNeXt-Tiny model...');
                return await cachedRes.arrayBuffer();
            }
        } catch {}
    }

    if (onProgress) onProgress('Downloading ConvNeXt-Tiny INT8 (26.9 MB)...');
    const response = await fetch(MODEL_URL, { credentials: 'same-origin' });
    if (!response.ok) {
        throw new Error(`Failed to fetch model (${response.status})`);
    }

    const contentLength = Number(response.headers.get('content-length')) || (26.94 * 1024 * 1024);
    if (!response.body || !response.body.getReader) {
        const buf = await response.arrayBuffer();
        if ('caches' in window) {
            try {
                const cache = await caches.open(MODEL_CACHE_NAME);
                await cache.put(MODEL_URL, new Response(buf.slice(0), { headers: { 'Content-Type': 'application/octet-stream' } }));
            } catch {}
        }
        return buf;
    }

    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.byteLength;
        if (onProgress) {
            const pct = Math.min(99, Math.round((received / contentLength) * 100));
            onProgress(`Loading ConvNeXt-Tiny INT8 (${pct}%)...`);
        }
    }

    const fullBuffer = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
        fullBuffer.set(chunk, offset);
        offset += chunk.byteLength;
    }

    if ('caches' in window) {
        try {
            const cache = await caches.open(MODEL_CACHE_NAME);
            await cache.put(MODEL_URL, new Response(fullBuffer.buffer.slice(0), { headers: { 'Content-Type': 'application/octet-stream' } }));
        } catch {}
    }

    return fullBuffer.buffer;
}

async function getDetectorSession(onProgress) {
    if (ortSessionPromise) return ortSessionPromise;

    ortSessionPromise = (async () => {
        try {
            const ort = await loadOrtRuntime();
            const modelBuffer = await fetchModelBufferWithCache(onProgress);
            if (onProgress) onProgress('Initializing WASM SIMD inference session...');
            const session = await ort.InferenceSession.create(modelBuffer, {
                executionProviders: ['wasm'],
                graphOptimizationLevel: 'all'
            });
            return { ort, session };
        } catch (err) {
            ortSessionPromise = null;
            throw err;
        }
    })();

    return ortSessionPromise;
}

async function runRealModelOnCanvas(img, canvas, onProgress) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;  // 224
    const h = canvas.height; // 224

    // Proportional 5%-margin center-crop + square crop matching crop.py & utils.get_transform()
    const natW = img.naturalWidth || img.width;
    const natH = img.naturalHeight || img.height;
    const marginX = Math.round(natW * 0.05);
    const marginY = Math.round(natH * 0.05);
    const cropW = Math.max(1, natW - marginX * 2);
    const cropH = Math.max(1, natH - marginY * 2);

    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, marginX, marginY, cropW, cropH, 0, 0, w, h);

    // Extract clean 224x224 RGB pixels BEFORE drawing any HUD brackets
    const imgData = ctx.getImageData(0, 0, w, h).data;

    // Draw subtle biometric crop brackets over custom image
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.lineWidth = 2;
    const m = 10, len = 14;
    ctx.beginPath(); ctx.moveTo(m, m + len); ctx.lineTo(m, m); ctx.lineTo(m + len, m); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w - m - len, m); ctx.lineTo(w - m, m); ctx.lineTo(w - m, m + len); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(m, h - m - len); ctx.lineTo(m, h - m); ctx.lineTo(m + len, h - m); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w - m - len, h - m); ctx.lineTo(w - m, h - m); ctx.lineTo(w - m, h - m - len); ctx.stroke();

    // Build NCHW Float32Array [1, 3, 224, 224] with ImageNet normalization
    const area = w * h;
    const tensorData = new Float32Array(3 * area);
    const meanR = 0.485, meanG = 0.456, meanB = 0.406;
    const stdR = 0.229, stdG = 0.224, stdB = 0.225;

    for (let i = 0; i < area; i++) {
        const p = i * 4;
        const r = imgData[p] / 255.0;
        const g = imgData[p + 1] / 255.0;
        const b = imgData[p + 2] / 255.0;

        tensorData[i] = (r - meanR) / stdR;
        tensorData[area + i] = (g - meanG) / stdG;
        tensorData[2 * area + i] = (b - meanB) / stdB;
    }

    const { ort, session } = await getDetectorSession(onProgress);
    if (onProgress) onProgress('Running ConvNeXt-Tiny + SGD inference...');

    const inputTensor = new ort.Tensor('float32', tensorData, [1, 3, h, w]);
    const outputs = await session.run({ input: inputTensor });

    const embedding = outputs.embedding.data; // Float32Array(768)
    const probsRaw = outputs.probs.data;      // Float32Array(3) [Real, AI Fake, Deepfake]

    let sumSq = 0;
    for (let i = 0; i < embedding.length; i++) {
        sumSq += embedding[i] * embedding[i];
    }
    const l2Norm = Math.sqrt(sumSq).toFixed(2);

    const realPct = Number((probsRaw[0] * 100).toFixed(1));
    const aiPct = Number((probsRaw[1] * 100).toFixed(1));
    const dfPct = Number(Math.max(0, 100 - realPct - aiPct).toFixed(1));

    let prediction = "REAL";
    let badgeClass = "verdict-real";
    let color = "#10b981";
    if (aiPct >= realPct && aiPct >= dfPct) {
        prediction = "AI FAKE";
        badgeClass = "verdict-ai";
        color = "#f59e0b";
    } else if (dfPct >= realPct && dfPct >= aiPct) {
        prediction = "DEEPFAKE";
        badgeClass = "verdict-df";
        color = "#ef4444";
    }

    return {
        prediction,
        badgeClass,
        probs: { real: realPct, ai: aiPct, df: dfPct },
        l2Norm,
        seed: 1,
        color,
        embedding
    };
}

function initDetectorDemo() {
    const demoCard = document.getElementById('detector-demo');
    if (!demoCard) return;

    const canvas = document.getElementById('detector-preview-canvas');
    const canvasWrap = document.getElementById('detector-canvas-wrap');
    const verdictBadge = document.getElementById('detector-verdict-badge');
    const verdictConf = document.getElementById('detector-verdict-conf');
    const probValReal = document.getElementById('prob-val-real');
    const probValAi = document.getElementById('prob-val-ai');
    const probValDf = document.getElementById('prob-val-df');
    const probBarReal = document.getElementById('prob-bar-real');
    const probBarAi = document.getElementById('prob-bar-ai');
    const probBarDf = document.getElementById('prob-bar-df');
    const statusMsg = document.getElementById('detector-status-msg');
    const sampleBtns = demoCard.querySelectorAll('.detector-sample-btn');
    const fileInput = document.getElementById('detector-file-input');
    const uploadLabel = document.getElementById('detector-upload-label');
    const uploadText = document.getElementById('detector-upload-text');

    let isInferring = false;
    let cooldownTimer = null;

    const setUploadButtonState = (disabled, labelText) => {
        if (uploadLabel) {
            uploadLabel.classList.toggle('is-disabled', disabled);
            uploadLabel.setAttribute('aria-disabled', disabled ? 'true' : 'false');
        }
        if (fileInput) {
            fileInput.disabled = disabled;
        }
        if (uploadText && labelText) {
            uploadText.textContent = labelText;
        }
    };

    const showStatus = (message, isError = false) => {
        if (!statusMsg) return;
        if (!message) {
            statusMsg.hidden = true;
            statusMsg.textContent = '';
            statusMsg.classList.remove('is-error');
            return;
        }
        statusMsg.hidden = false;
        statusMsg.classList.toggle('is-error', isError);
        statusMsg.textContent = message;
    };

    const startCooldownCountdown = (durationMs, prefix = 'Cooldown') => {
        if (cooldownTimer) clearInterval(cooldownTimer);
        const endTs = Date.now() + durationMs;
        const tick = () => {
            const remMs = endTs - Date.now();
            if (remMs <= 0) {
                clearInterval(cooldownTimer);
                cooldownTimer = null;
                if (!isInferring) {
                    setUploadButtonState(false, 'Test Custom Image');
                }
                return;
            }
            const sec = Math.ceil(remMs / 1000);
            setUploadButtonState(true, `${prefix} (${sec}s)`);
        };
        tick();
        cooldownTimer = setInterval(tick, 250);
    };

    const updateUI = ({ prediction, badgeClass, probs }) => {
        if (canvasWrap) {
            canvasWrap.classList.remove('is-scanning');
            void canvasWrap.offsetWidth;
            canvasWrap.classList.add('is-scanning');
        }

        const maxConf = Math.max(probs.real, probs.ai, probs.df);
        if (verdictBadge) {
            verdictBadge.textContent = prediction;
            verdictBadge.className = `verdict-badge ${badgeClass}`;
        }
        if (verdictConf) verdictConf.textContent = `${maxConf.toFixed(1)}%`;

        if (probValReal) probValReal.textContent = `${probs.real.toFixed(1)}%`;
        if (probValAi) probValAi.textContent = `${probs.ai.toFixed(1)}%`;
        if (probValDf) probValDf.textContent = `${probs.df.toFixed(1)}%`;

        if (probBarReal) probBarReal.style.width = `${probs.real}%`;
        if (probBarAi) probBarAi.style.width = `${probs.ai}%`;
        if (probBarDf) probBarDf.style.width = `${probs.df}%`;
    };

    const selectPreset = (key) => {
        const preset = PRESET_SAMPLES[key];
        if (!preset) return;
        showStatus('');
        sampleBtns.forEach(btn => {
            const active = btn.getAttribute('data-sample') === key;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        drawPresetSample(canvas, key, preset);
        updateUI({
            prediction: preset.prediction,
            badgeClass: preset.badgeClass,
            probs: preset.probs
        });
    };

    sampleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            selectPreset(btn.getAttribute('data-sample'));
        });
    });

    if (uploadLabel) {
        // Warm up ONNX Runtime script on hover/focus
        uploadLabel.addEventListener('mouseenter', () => { loadOrtRuntime().catch(() => {}); }, { once: true });
        uploadLabel.addEventListener('click', (e) => {
            if (isInferring) {
                e.preventDefault();
                return;
            }
            const rl = checkRateLimit();
            if (!rl.allowed) {
                e.preventDefault();
                showStatus(rl.reason, true);
                startCooldownCountdown(rl.waitMs, 'Rate Limited');
            }
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            fileInput.value = '';
            if (!file) return;

            if (isInferring) return;

            const rl = checkRateLimit();
            if (!rl.allowed) {
                showStatus(rl.reason, true);
                startCooldownCountdown(rl.waitMs, 'Rate Limited');
                return;
            }

            const validation = await validateImageFile(file);
            if (!validation.valid) {
                showStatus(validation.error, true);
                return;
            }

            isInferring = true;
            setUploadButtonState(true, 'Analyzing...');
            showStatus('Preparing image...');

            const objUrl = URL.createObjectURL(file);
            const img = new Image();

            img.onload = async () => {
                URL.revokeObjectURL(objUrl);

                const natW = img.naturalWidth || img.width;
                const natH = img.naturalHeight || img.height;
                if (natW > MAX_DIMENSION || natH > MAX_DIMENSION || natW < MIN_DIMENSION || natH < MIN_DIMENSION) {
                    isInferring = false;
                    setUploadButtonState(false, 'Test Custom Image');
                    showStatus(
                        `Image dimensions (${natW}×${natH}) outside allowed range (${MIN_DIMENSION}px–${MAX_DIMENSION}px).`,
                        true
                    );
                    return;
                }

                // Record valid upload against rate limit
                recordUploadTimestamp();

                sampleBtns.forEach(b => {
                    b.classList.remove('active');
                    b.setAttribute('aria-selected', 'false');
                });

                try {
                    const res = await runRealModelOnCanvas(img, canvas, (statusText) => {
                        showStatus(statusText, false);
                    });
                    showStatus('');
                    updateUI(res);
                } catch (err) {
                    showStatus(err?.message || 'Failed to run ConvNeXt-Tiny ONNX model.', true);
                } finally {
                    isInferring = false;
                    const postRl = checkRateLimit();
                    if (!postRl.allowed) {
                        startCooldownCountdown(postRl.waitMs, 'Cooldown');
                    } else {
                        startCooldownCountdown(RL_COOLDOWN_MS, 'Cooldown');
                    }
                }
            };

            img.onerror = () => {
                URL.revokeObjectURL(objUrl);
                isInferring = false;
                setUploadButtonState(false, 'Test Custom Image');
                showStatus('Browser failed to decode image payload.', true);
            };

            img.src = objUrl;
        });
    }

    // Initial render
    selectPreset('real');
}

function init() {
    initAmbientMesh();
    initGlobalReveal();
    initGlassParallax();
    initDetectorDemo();
    loadProjectReadme();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
