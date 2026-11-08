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
        // The README's tables use LaTeX \multicolumn{n}{c}{...} cells, which GitHub leaves as text
        .replace(
            /<td[^>]*>\\multicolumn\{(\d+)\}\{[a-z]\}\{(.*?)\}<\/td>(?:\s*<td[^>]*><\/td>){0,4}/gi,
            '<td colspan="$1" style="text-align: center;">$2</td>'
        )
        .replace(/\\multicolumn\{\d+\}\{[a-z]\}\{\*\*(.*?)\*\*\s*(.*?)\}/g, '<strong>$1</strong> $2')
        .replace(/\\multicolumn\{\d+\}\{[a-z]\}\{(.*?)\}/g, '$1');
}

const MERMAID_URL = 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.esm.min.mjs';
let mermaidPromise = null;

// GitHub's markdown API returns ```mermaid blocks as highlighted code; render them as diagrams.
// Loaded only when a diagram is present. If the CDN is unreachable the code block stays.
async function renderMermaidDiagrams(container) {
    const blocks = container.querySelectorAll('.highlight-source-mermaid');
    if (blocks.length === 0) return;
    let mermaid;
    try {
        mermaidPromise ??= import(MERMAID_URL).then(({ default: mermaid }) => {
            mermaid.initialize({
                startOnLoad: false,
                theme: 'dark',
                themeVariables: {
                    darkMode: true,
                    background: 'transparent',
                    fontFamily: 'Inter, sans-serif',
                    primaryColor: '#0b1a33',
                    primaryBorderColor: '#2b4a7a',
                    primaryTextColor: '#e6ebf1',
                    lineColor: '#8c9bb0'
                }
            });
            return mermaid;
        });
        mermaid = await mermaidPromise;
    } catch {
        mermaidPromise = null; // let a later render retry the import
        return;
    }
    // The README may have been re-rendered while mermaid loaded; skip blocks no longer on the page
    const live = [...blocks].filter(block => block.isConnected);
    if (live.length === 0) return;
    const nodes = live.map(block => {
        const diagram = document.createElement('pre');
        diagram.className = 'mermaid';
        diagram.textContent = block.textContent;
        block.replaceWith(diagram);
        return diagram;
    });
    try {
        await mermaid.run({ nodes });
    } catch {
        // Put the highlighted code blocks back rather than leaving raw diagram source
        nodes.forEach((diagram, i) => diagram.isConnected && diagram.replaceWith(live[i]));
    }
}

function loadProjectReadme() {
    const container = document.getElementById("github-content");
    if (!container) return;

    const repoPath = "simplyigit/Real-Deepfake-or-AI";
    const repoName = "Real-Deepfake-or-AI";
    const CACHE_KEY = "simplyigit_project_v2_" + repoName;

    let appliedHtml = '';
    const showReadme = (html) => {
        appliedHtml = html;
        container.innerHTML = html;
        renderMermaidDiagrams(container);
    };

    try {
        const cachedData = localStorage.getItem(CACHE_KEY);
        if (cachedData) {
            showReadme(cachedData);
        }
    } catch {}

    const applyContent = (rawContent) => {
        const clean = sanitizeProjectHtml(rawContent);
        if (!clean) return false;
        // Unchanged since the cached render: keep the DOM (and any rendered diagrams) as is
        if (clean !== appliedHtml) showReadme(clean);
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
            container.innerHTML = `<p class="readme-error">Could not load project README. Please check the repository link above.</p>`;
        }
    });
}

// The preview canvas is read back for inference; a CPU-backed context keeps that readback (and so the
// model's output for a given image) identical across runs instead of switching backends after the first read
function getPreviewContext(canvas) {
    return canvas.getContext('2d', { willReadFrequently: true });
}

function drawPresetSample(canvas, type, preset) {
    if (!canvas) return;
    const ctx = getPreviewContext(canvas);
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

// --- Client-Side File Validation ---
const ALLOWED_EXTENSIONS = /\.(jpe?g|png|webp)$/i;
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_DIMENSION = 8192;
const MIN_DIMENSION = 16;

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
// Bump the file version whenever the model is retrained so visitors never get a stale cached copy
const MODEL_URL = '/assets/models/convnext_sgd_int8.v1.onnx';
const MODEL_CACHE_NAME = 'simplyigit-detector-onnx-v1';

// Opens the model cache and evicts any older model file so a stale 27 MB copy isn't left behind
async function openModelCache() {
    const cache = await caches.open(MODEL_CACHE_NAME);
    for (const request of await cache.keys()) {
        if (new URL(request.url).pathname !== MODEL_URL) await cache.delete(request);
    }
    return cache;
}

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
            const cache = await openModelCache();
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

// --- Pillow-exact resize ---
// Training used torchvision's Resize((224, 224)) on PIL images, i.e. Pillow's antialiased bilinear
// filter. The canvas's own scaling uses a different filter and visibly shifts the model's output, so
// this reproduces Pillow's Resample.c (fixed-point weights, 8-bit intermediate pass) exactly.
const PRECISION_BITS = 22; // 32 - 8 - 2, as in Pillow
const MAX_CANVAS_PIXELS = 4096 * 4096;

function bilinearCoefficients(inSize, outSize) {
    const scale = inSize / outSize;
    const filterScale = Math.max(scale, 1);
    const support = filterScale; // the bilinear filter's support is 1
    const bounds = new Int32Array(outSize);
    const weights = [];
    for (let i = 0; i < outSize; i++) {
        const center = (i + 0.5) * scale;
        const min = Math.max(Math.trunc(center - support + 0.5), 0);
        const max = Math.min(Math.trunc(center + support + 0.5), inSize);
        const raw = [];
        let total = 0;
        for (let x = min; x < max; x++) {
            const w = Math.max(0, 1 - Math.abs((x - center + 0.5) / filterScale));
            raw.push(w);
            total += w;
        }
        bounds[i] = min;
        weights.push(Int32Array.from(raw, w => {
            const v = (total ? w / total : 0) * (1 << PRECISION_BITS);
            return Math.trunc(v < 0 ? v - 0.5 : v + 0.5);
        }));
    }
    return { bounds, weights };
}

function clip8(sum) {
    if (sum >= 255 * (1 << PRECISION_BITS)) return 255;
    if (sum <= 0) return 0;
    return Math.floor(sum / (1 << PRECISION_BITS));
}

// RGBA source pixels (srcW x srcH) -> packed RGB (outW x outH): horizontal pass, then vertical
function pillowResizeBilinear(src, srcW, srcH, outW, outH) {
    const horiz = bilinearCoefficients(srcW, outW);
    const vert = bilinearCoefficients(srcH, outH);
    const half = 1 << (PRECISION_BITS - 1);

    const tmp = new Uint8Array(outW * srcH * 3);
    for (let y = 0; y < srcH; y++) {
        for (let x = 0; x < outW; x++) {
            const k = horiz.weights[x];
            let r = half, g = half, b = half;
            let p = (y * srcW + horiz.bounds[x]) * 4;
            for (let i = 0; i < k.length; i++, p += 4) {
                r += src[p] * k[i];
                g += src[p + 1] * k[i];
                b += src[p + 2] * k[i];
            }
            const o = (y * outW + x) * 3;
            tmp[o] = clip8(r);
            tmp[o + 1] = clip8(g);
            tmp[o + 2] = clip8(b);
        }
    }

    const out = new Uint8Array(outW * outH * 3);
    for (let y = 0; y < outH; y++) {
        const k = vert.weights[y];
        const y0 = vert.bounds[y];
        for (let x = 0; x < outW; x++) {
            let r = half, g = half, b = half;
            for (let i = 0; i < k.length; i++) {
                const p = ((y0 + i) * outW + x) * 3;
                r += tmp[p] * k[i];
                g += tmp[p + 1] * k[i];
                b += tmp[p + 2] * k[i];
            }
            const o = (y * outW + x) * 3;
            out[o] = clip8(r);
            out[o + 1] = clip8(g);
            out[o + 2] = clip8(b);
        }
    }
    return out;
}

async function runRealModelOnCanvas(img, canvas, onProgress) {
    const ctx = getPreviewContext(canvas);
    const w = canvas.width;  // 224
    const h = canvas.height; // 224

    // crop.py's proportional center crop: trim int(5%) from each side
    const natW = img.naturalWidth || img.width;
    const natH = img.naturalHeight || img.height;
    const marginX = Math.floor(natW * 0.05);
    const marginY = Math.floor(natH * 0.05);
    const cropW = Math.max(1, natW - marginX * 2);
    const cropH = Math.max(1, natH - marginY * 2);

    // Copy the cropped region 1:1 (no scaling) to read the decoded pixels. Crops over the canvas
    // pixel limit (iOS Safari: 4096x4096) are pre-shrunk by the browser first, so only those lose parity.
    const shrink = Math.min(1, Math.sqrt(MAX_CANVAS_PIXELS / (cropW * cropH)));
    const srcW = Math.max(1, Math.floor(cropW * shrink));
    const srcH = Math.max(1, Math.floor(cropH * shrink));

    // Like PIL, ignore the embedded colour profile (e.g. Display P3) where the browser supports it
    let source = img;
    let sx = marginX, sy = marginY, sw = cropW, sh = cropH;
    try {
        source = await createImageBitmap(img, marginX, marginY, cropW, cropH, {
            colorSpaceConversion: 'none',
            ...(shrink < 1 && { resizeWidth: srcW, resizeHeight: srcH, resizeQuality: 'high' })
        });
        sx = 0; sy = 0; sw = source.width; sh = source.height;
    } catch {}

    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = srcW;
    srcCanvas.height = srcH;
    const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
    srcCtx.drawImage(source, sx, sy, sw, sh, 0, 0, srcW, srcH);
    if (source !== img) source.close();
    const srcPixels = srcCtx.getImageData(0, 0, srcW, srcH).data;

    // utils.get_transform(): Resize((224, 224)) — squashes to a square, as in training
    const rgb = pillowResizeBilinear(srcPixels, srcW, srcH, w, h);

    // Preview exactly what the model sees
    const preview = ctx.createImageData(w, h);
    for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
        preview.data[j] = rgb[i];
        preview.data[j + 1] = rgb[i + 1];
        preview.data[j + 2] = rgb[i + 2];
        preview.data[j + 3] = 255;
    }
    ctx.putImageData(preview, 0, 0);

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
        const p = i * 3;
        const r = rgb[p] / 255.0;
        const g = rgb[p + 1] / 255.0;
        const b = rgb[p + 2] / 255.0;

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
    const dfPct = Number((probsRaw[2] * 100).toFixed(1));

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
            if (isInferring) e.preventDefault();
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            fileInput.value = '';
            if (!file) return;

            if (isInferring) return;

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
                    setUploadButtonState(false, 'Test Custom Image');
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
