import { initAmbientMesh, initGlobalReveal, initGlassParallax, initLibraryKeys, showSyncedAt } from '../modules/core.js';
import { pillowResizeBilinear, normalizeToTensor } from '../modules/pillow-resize.js';

const PRESET_SAMPLES = {
    real: {
        prediction: "REAL",
        badgeClass: "verdict-real",
        probs: { real: 96.4, ai: 3.4, df: 0.2 },
        color: "#10b981"
    },
    ai: {
        prediction: "AI FAKE",
        badgeClass: "verdict-ai",
        probs: { real: 4.9, ai: 94.8, df: 0.3 },
        color: "#f59e0b"
    },
    deepfake: {
        prediction: "DEEPFAKE",
        badgeClass: "verdict-df",
        probs: { real: 0.3, ai: 0.6, df: 99.1 },
        color: "#ef4444"
    }
};

// README images use repo-relative paths ("images/x.png", "./x.png", "/x.png"), which would resolve
// against this page's URL; point them at the file in the repo instead
function absolutizeReadmeImages(html, repoPath, branch) {
    return html.replace(
        /(<img\b[^>]*?\ssrc=")(?![a-z][a-z0-9+.-]*:|\/\/|#)([^"]+)"/gi,
        (_, prefix, path) => `${prefix}https://raw.githubusercontent.com/${repoPath}/${branch}/${path.replace(/^\.?\//, '')}"`
    );
}

// Fixes up the README HTML for this page. It does not sanitize: the README, the Supabase row and the repo
// are all the site owner's, and GitHub's markdown API (the sync's first choice) strips scripts
function prepareReadmeHtml(html, repoPath, branch = 'main') {
    if (!html) return '';
    return absolutizeReadmeImages(html, repoPath, branch)
        .replace(/<pre\b([^>]*?)\slang="([^"]*)"/gi, '<pre$1 data-lang="$2"')
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
    const nodes = live.map((block, i) => {
        const diagram = document.createElement('pre');
        diagram.className = 'mermaid';
        diagram.tabIndex = 0;
        diagram.setAttribute('role', 'region');
        diagram.setAttribute('aria-label', live.length > 1 ? `Architecture diagram ${i + 1}` : 'Architecture diagram');
        diagram.textContent = block.textContent;
        block.replaceWith(diagram);
        return diagram;
    });
    try {
        await mermaid.run({ nodes });
        // On narrow screens where the 720px diagram scrolls sideways, add a right-edge fade + "scroll →" hint
        nodes.forEach((diagram) => {
            if (!diagram.isConnected || diagram.parentElement?.classList.contains('mermaid-scroll-wrap')) return;
            const wrap = document.createElement('div');
            wrap.className = 'mermaid-scroll-wrap';
            diagram.replaceWith(wrap);
            wrap.appendChild(diagram);
            const hint = document.createElement('span');
            hint.className = 'mermaid-scroll-hint';
            hint.setAttribute('aria-hidden', 'true');
            hint.textContent = 'scroll →';
            wrap.appendChild(hint);

            const syncHint = () => {
                const overflows = diagram.scrollWidth > diagram.clientWidth + 6;
                const atEnd = diagram.scrollLeft + diagram.clientWidth >= diagram.scrollWidth - 8;
                wrap.classList.toggle('is-scrollable', overflows && !atEnd);
                wrap.classList.toggle('has-scrolled', diagram.scrollLeft > 12);
            };
            syncHint();
            diagram.addEventListener('scroll', syncHint, { passive: true });
            window.addEventListener('resize', syncHint, { passive: true });
        });
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
        // The README opens with its own title, which the page header already shows
        const title = container.querySelector('h1');
        if (title && !title.closest('.markdown-heading, h1')?.previousElementSibling) {
            (title.closest('.markdown-heading') || title).remove();
        }
        // Strip GitHub's 0x0 invisible heading anchors so they don't create broken tab stops
        container.querySelectorAll('a.anchor').forEach(a => a.remove());
        // Fix any cached <pre lang="..."> attributes and make scrollable regions keyboard-focusable
        let codeIdx = 0;
        let diagramIdx = 0;
        container.querySelectorAll('pre').forEach(pre => {
            if (pre.hasAttribute('lang')) {
                pre.setAttribute('data-lang', pre.getAttribute('lang'));
                pre.removeAttribute('lang');
            }
            pre.setAttribute('tabindex', '0');
            pre.setAttribute('role', 'region');
            if (pre.classList.contains('mermaid')) {
                diagramIdx += 1;
                pre.setAttribute('aria-label', `Architecture diagram ${diagramIdx}`);
            } else {
                codeIdx += 1;
                pre.setAttribute('aria-label', `Code sample ${codeIdx}`);
            }
        });
        container.querySelectorAll('table').forEach((table, i) => {
            table.setAttribute('tabindex', '0');
            table.setAttribute('role', 'region');
            table.setAttribute('aria-label', `Data table ${i + 1}`);
        });
        renderMermaidDiagrams(container);
    };

    try {
        const cachedData = localStorage.getItem(CACHE_KEY);
        if (cachedData) {
            showReadme(cachedData);
        }
    } catch {}

    const applyContent = (rawContent) => {
        const clean = prepareReadmeHtml(rawContent, repoPath);
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
                    if (content) {
                        if (json.synced_at) showSyncedAt(json.synced_at);
                        return content;
                    }
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
                    if (content) {
                        if (json.synced_at) showSyncedAt(json.synced_at);
                        return content;
                    }
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
    ctx.strokeStyle = preset.color;
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
const MIME_EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// Pasted or dragged images can arrive without a usable file name: name them after their type,
// so validateImageFile() checks them like any picked file
function withImageName(file) {
    const ext = MIME_EXTENSIONS[(file.type || '').toLowerCase()];
    if (ALLOWED_EXTENSIONS.test(file.name || '') || !ext) return file;
    return new File([file], `image.${ext}`, { type: file.type });
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
// Subresource integrity for ORT_CDN_URL: recompute when the version changes
// (curl -s <url> | openssl dgst -sha384 -binary | base64)
const ORT_CDN_INTEGRITY = 'sha384-RPL/K8tc0JVaNWsunkEmCzLeieefvFX2UCRLKLmLVChCI6P+CTKhzqF7VIeCc3Zp';
const ORT_WASM_DIR = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';
// Bump the file version whenever the model is retrained so visitors never get a stale cached copy
const MODEL_URL = '/assets/models/convnext_sgd_int8.v1.onnx';
const MODEL_CACHE_NAME = 'simplyigit-detector-onnx-v2';
const MODEL_EXPECTED_BYTES = 28247291;

// Opens the model cache, deletes any legacy v1 cache, and evicts stale model URLs
async function openModelCache() {
    caches.delete('simplyigit-detector-onnx-v1').catch(() => {});
    const cache = await caches.open(MODEL_CACHE_NAME);
    for (const request of await cache.keys()) {
        if (new URL(request.url).pathname !== MODEL_URL) await cache.delete(request);
    }
    return cache;
}

async function deleteCachedModel() {
    if (!('caches' in window)) return;
    try {
        const cache = await caches.open(MODEL_CACHE_NAME);
        await cache.delete(MODEL_URL);
    } catch {}
}

let ortSessionPromise = null;
let ortScriptPromise = null;

function loadOrtRuntime() {
    if (window.ort) return Promise.resolve(window.ort);
    if (ortScriptPromise) return ortScriptPromise;

    ortScriptPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = ORT_CDN_URL;
        script.integrity = ORT_CDN_INTEGRITY;
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

async function fetchModelBufferWithCache(onProgress, { bypassCache = false } = {}) {
    if (!bypassCache && 'caches' in window) {
        try {
            const cache = await openModelCache();
            const cachedRes = await cache.match(MODEL_URL);
            if (cachedRes && cachedRes.ok) {
                if (onProgress) onProgress('Loading cached ConvNeXt-Tiny model...');
                const buf = await cachedRes.arrayBuffer();
                if (buf.byteLength === MODEL_EXPECTED_BYTES) {
                    return { buffer: buf, fromCache: true };
                }
                await cache.delete(MODEL_URL);
            }
        } catch {}
    }

    if (onProgress) onProgress('Downloading ConvNeXt-Tiny INT8 (26.9 MB)...');
    const response = await fetch(MODEL_URL, { credentials: 'same-origin' });
    if (!response.ok) {
        throw new Error(`Failed to fetch model (${response.status})`);
    }

    const contentLength = Number(response.headers.get('content-length')) || MODEL_EXPECTED_BYTES;
    if (!response.body || !response.body.getReader) {
        const buf = await response.arrayBuffer();
        if (buf.byteLength !== MODEL_EXPECTED_BYTES) {
            throw new Error('Model download was incomplete; please retry.');
        }
        if ('caches' in window) {
            try {
                const cache = await caches.open(MODEL_CACHE_NAME);
                await cache.put(MODEL_URL, new Response(buf, { headers: { 'Content-Type': 'application/octet-stream' } }));
            } catch {}
        }
        return { buffer: buf, fromCache: false };
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

    if (received !== MODEL_EXPECTED_BYTES) {
        throw new Error('Model download was incomplete; please retry.');
    }

    // Release each chunk once copied, so the model isn't held twice (~27 MB) on memory-tight phones
    const fullBuffer = new Uint8Array(received);
    let offset = 0;
    for (let i = 0; i < chunks.length; i++) {
        fullBuffer.set(chunks[i], offset);
        offset += chunks[i].byteLength;
        chunks[i] = null;
    }
    chunks.length = 0;

    if ('caches' in window) {
        try {
            const cache = await caches.open(MODEL_CACHE_NAME);
            // The Response copies the bytes itself; an extra .slice() would add a third copy
            await cache.put(MODEL_URL, new Response(fullBuffer, { headers: { 'Content-Type': 'application/octet-stream' } }));
        } catch {}
    }

    return { buffer: fullBuffer.buffer, fromCache: false };
}

function formatOrtError(err) {
    const msg = String(err?.message || '');
    if (/protobuf|invalid|failed to load model|failed to fetch|incomplete/i.test(msg)) {
        return new Error('The model download was corrupted or incomplete; please retry.');
    }
    return err instanceof Error ? err : new Error('Failed to load ConvNeXt-Tiny ONNX model.');
}

const SESSION_OPTIONS = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };

// Creates the session with create(buffer), re-downloading once if a cached model turns out to be corrupt
async function createSessionWithRetry(create, onProgress) {
    let { buffer, fromCache } = await fetchModelBufferWithCache(onProgress);
    if (onProgress) onProgress('Initializing WASM SIMD inference session...');
    try {
        return await create(buffer);
    } catch (err) {
        if (!fromCache) throw formatOrtError(err);
        await deleteCachedModel();
        ({ buffer } = await fetchModelBufferWithCache(onProgress, { bypassCache: true }));
        if (onProgress) onProgress('Initializing WASM SIMD inference session...');
        try {
            return await create(buffer);
        } catch (retryErr) {
            throw formatOrtError(retryErr);
        }
    }
}

// --- Inference off the main thread ---
// ONNX Runtime runs in a worker made from the SRI-checked runtime plus detectorWorkerMain(), so
// creating the session and every run (seconds on a phone) never freeze the page. Where workers
// aren't available, or the worker fails, the model runs on the main thread as before.

// The worker's own code: runs after the ONNX Runtime bundle in the same script, so `ort` is global.
// It's stringified into the worker, so it can't use anything from this module.
function detectorWorkerMain() {
    let session = null;
    self.onmessage = async ({ data }) => {
        const { id, type } = data || {};
        try {
            if (type === 'init') {
                ort.env.wasm.wasmPaths = data.wasmPaths;
                ort.env.wasm.numThreads = 1;
                session = await ort.InferenceSession.create(data.buffer, data.options);
                self.postMessage({ id, ok: true });
            } else if (type === 'run') {
                const input = new ort.Tensor('float32', data.tensor, data.dims);
                const start = performance.now();
                const outputs = await session.run({ input });
                const inferenceMs = performance.now() - start;
                // Copies: an output can be a view into the runtime's memory, which can't be transferred
                const probs = Float32Array.from(outputs.probs.data);
                const embedding = outputs.embedding ? Float32Array.from(outputs.embedding.data) : null;
                self.postMessage({ id, ok: true, probs, embedding, inferenceMs },
                    embedding ? [probs.buffer, embedding.buffer] : [probs.buffer]);
            }
        } catch (err) {
            self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
        }
    };
}

let ortWorkerPromise = null;
let ortWorkerDisabled = false;

function startOrtWorker(runtimeSource) {
    let url = URL.createObjectURL(new Blob([runtimeSource, `\n;(${detectorWorkerMain})();\n`], { type: 'text/javascript' }));
    const worker = new Worker(url, { name: 'simplyigit-detector' });
    const pending = new Map();
    let nextId = 0;
    const releaseUrl = () => {
        if (url) URL.revokeObjectURL(url);
        url = null;
    };
    const client = {
        dead: false,
        call(message, transfer = []) {
            if (client.dead) return Promise.reject(new Error('The detector worker stopped.'));
            return new Promise((resolve, reject) => {
                const id = ++nextId;
                pending.set(id, { resolve, reject });
                worker.postMessage({ ...message, id }, transfer);
            });
        },
        // Stops the worker for good: the page falls back to the main thread
        stop(err = new Error('The detector worker stopped.')) {
            if (client.dead) return;
            client.dead = true;
            ortWorkerDisabled = true;
            ortWorkerPromise = null;
            worker.terminate();
            releaseUrl();
            for (const p of pending.values()) p.reject(err);
            pending.clear();
        }
    };
    worker.onmessage = ({ data }) => {
        releaseUrl();
        const p = pending.get(data?.id);
        if (!p) return;
        pending.delete(data.id);
        if (data.ok) p.resolve(data);
        else p.reject(new Error(data.error || 'Inference failed.'));
    };
    worker.onerror = (e) => {
        e.preventDefault();
        client.stop(new Error(e.message || 'The detector worker failed.'));
    };
    return client;
}

// Resolves to the worker client, or null to run on the main thread
function getOrtWorker() {
    if (ortWorkerDisabled || typeof Worker === 'undefined' || typeof Blob === 'undefined') return Promise.resolve(null);
    if (!ortWorkerPromise) {
        ortWorkerPromise = (async () => {
            try {
                // Fetched with its integrity hash, so the worker runs exactly the bytes the <script> path would
                const res = await fetch(ORT_CDN_URL, { integrity: ORT_CDN_INTEGRITY, mode: 'cors', credentials: 'omit' });
                if (!res.ok) throw new Error(`ONNX Runtime Web: HTTP ${res.status}`);
                return startOrtWorker(await res.text());
            } catch {
                ortWorkerPromise = null; // a network blip: try the worker again next time
                return null;
            }
        })();
    }
    return ortWorkerPromise;
}

// Loads the runtime ahead of the first image (hover/focus on the upload button)
function warmDetectorRuntime() {
    getOrtWorker().then(client => client || loadOrtRuntime()).catch(() => {});
}

// Resolves to { run(tensor, dims) -> { probs, embedding, inferenceMs } }
async function getDetectorSession(onProgress) {
    if (ortSessionPromise) return ortSessionPromise;

    ortSessionPromise = (async () => {
        try {
            const client = await getOrtWorker();
            if (client) {
                try {
                    await createSessionWithRetry(buffer => client.call(
                        { type: 'init', buffer, wasmPaths: ORT_WASM_DIR, options: SESSION_OPTIONS }, [buffer]), onProgress);
                    return {
                        run: (tensor, dims) => client.call({ type: 'run', tensor, dims }, [tensor.buffer]).catch(err => {
                            if (client.dead) ortSessionPromise = null;
                            throw err;
                        })
                    };
                } catch (err) {
                    // Whatever broke in the worker, the main thread gets its own attempt
                    client.stop(err);
                }
            }

            const ort = await loadOrtRuntime();
            const session = await createSessionWithRetry(buffer => ort.InferenceSession.create(buffer, SESSION_OPTIONS), onProgress);
            return {
                run: async (tensor, dims) => {
                    const input = new ort.Tensor('float32', tensor, dims);
                    const start = performance.now();
                    const outputs = await session.run({ input });
                    return {
                        probs: outputs.probs.data,
                        embedding: outputs.embedding?.data || null,
                        inferenceMs: performance.now() - start
                    };
                }
            };
        } catch (err) {
            ortSessionPromise = null;
            throw formatOrtError(err);
        }
    })();

    return ortSessionPromise;
}

const MAX_CANVAS_PIXELS = 4096 * 4096;

// null = not created yet, false = unavailable (no module workers, or it failed once)
let preprocessWorker = null;
let preprocessReqId = 0;
const preprocessPending = new Map();

function getPreprocessWorker() {
    if (preprocessWorker === null) {
        try {
            const worker = new Worker(new URL('../workers/detector-preprocess.js', import.meta.url), { type: 'module' });
            worker.onmessage = (e) => {
                const { id, rgb, tensor } = e.data || {};
                const pending = preprocessPending.get(id);
                if (!pending) return;
                preprocessPending.delete(id);
                pending.resolve({ rgb, tensor });
            };
            worker.onerror = (e) => {
                e.preventDefault();
                const err = new Error(e.message || 'Preprocessing worker failed');
                for (const pending of preprocessPending.values()) pending.reject(err);
                preprocessPending.clear();
                worker.terminate();
                preprocessWorker = false;
            };
            preprocessWorker = worker;
        } catch {
            preprocessWorker = false;
        }
    }
    return preprocessWorker || null;
}

// Pillow resize + normalization in a worker, so a 12 MP upload doesn't block the main thread.
// readPixels() is called again for the main-thread fallback, since the worker takes ownership of its copy.
async function preprocessPixels(readPixels, srcW, srcH, outW, outH) {
    const worker = getPreprocessWorker();
    if (worker) {
        const id = ++preprocessReqId;
        try {
            return await new Promise((resolve, reject) => {
                preprocessPending.set(id, { resolve, reject });
                const pixels = readPixels();
                worker.postMessage({ id, pixels, srcW, srcH, outW, outH }, [pixels.buffer]);
            });
        } catch {
            preprocessPending.delete(id);
            if (preprocessWorker === worker) {
                worker.terminate();
                preprocessWorker = false;
            }
        }
    }
    const rgb = pillowResizeBilinear(readPixels(), srcW, srcH, outW, outH);
    return { rgb, tensor: normalizeToTensor(rgb, outW, outH) };
}

async function runRealModelOnCanvas(file, img, canvas, onProgress) {
    const ctx = getPreviewContext(canvas);
    const w = canvas.width;  // 224
    const h = canvas.height; // 224

    // Decode from the raw file with imageOrientation: 'none' and premultiplyAlpha: 'none' to match
    // PIL.Image.open() in training (ignore EXIF orientation tags and embedded color profiles).
    // Note: drawing onto a cleared 2D canvas still alpha-composites semi-transparent PNG pixels over transparent black.
    let rawBitmap = null;
    if (file) {
        try {
            rawBitmap = await createImageBitmap(file, {
                imageOrientation: 'none',
                premultiplyAlpha: 'none',
                colorSpaceConversion: 'none'
            });
        } catch {}
    }

    const baseSource = rawBitmap || img;
    try {
        // crop.py's proportional center crop: trim int(5%) from each side
        const natW = rawBitmap ? rawBitmap.width : (img.naturalWidth || img.width);
        const natH = rawBitmap ? rawBitmap.height : (img.naturalHeight || img.height);
        const marginX = Math.floor(natW * 0.05);
        const marginY = Math.floor(natH * 0.05);
        const cropW = Math.max(1, natW - marginX * 2);
        const cropH = Math.max(1, natH - marginY * 2);

        // Copy the cropped region 1:1 (no scaling) to read the decoded pixels. Crops over the canvas
        // pixel limit (iOS Safari: 4096x4096) are pre-shrunk by the browser first, so only those lose parity.
        const shrink = Math.min(1, Math.sqrt(MAX_CANVAS_PIXELS / (cropW * cropH)));
        const srcW = Math.max(1, Math.floor(cropW * shrink));
        const srcH = Math.max(1, Math.floor(cropH * shrink));

        let source = baseSource;
        let sx = marginX, sy = marginY, sw = cropW, sh = cropH;
        try {
            source = await createImageBitmap(baseSource, marginX, marginY, cropW, cropH, {
                imageOrientation: 'none',
                premultiplyAlpha: 'none',
                colorSpaceConversion: 'none',
                ...(shrink < 1 && { resizeWidth: srcW, resizeHeight: srcH, resizeQuality: 'high' })
            });
            sx = 0; sy = 0; sw = source.width; sh = source.height;
        } catch {}

        const srcCanvas = document.createElement('canvas');
        srcCanvas.width = srcW;
        srcCanvas.height = srcH;
        const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
        srcCtx.clearRect(0, 0, srcW, srcH);
        srcCtx.drawImage(source, sx, sy, sw, sh, 0, 0, srcW, srcH);
        if (source !== baseSource) source.close();

        // utils.get_transform(): Resize((224, 224)) — squashes to a square, as in training — then
        // NCHW Float32Array [1, 3, 224, 224] with ImageNet normalization
        const { rgb, tensor: tensorData } = await preprocessPixels(() => srcCtx.getImageData(0, 0, srcW, srcH).data, srcW, srcH, w, h);

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

        const detector = await getDetectorSession(onProgress);
        if (onProgress) onProgress('Running ConvNeXt-Tiny + SGD inference...');

        // probs: Float32Array(3) [Real, AI Fake, Deepfake]; embedding: the 768-D ConvNeXt features
        const { probs: probsRaw, embedding: embeddingRaw, inferenceMs } = await detector.run(tensorData, [1, 3, h, w]);
        let l2Norm = null;
        if (embeddingRaw && embeddingRaw.length > 0) {
            let sumSq = 0;
            for (let i = 0; i < embeddingRaw.length; i++) sumSq += embeddingRaw[i] * embeddingRaw[i];
            l2Norm = Math.sqrt(sumSq);
        }

        const realPct = Number((probsRaw[0] * 100).toFixed(1));
        const aiPct = Number((probsRaw[1] * 100).toFixed(1));
        const dfPct = Number((probsRaw[2] * 100).toFixed(1));

        let prediction = "REAL";
        let badgeClass = "verdict-real";
        if (aiPct >= realPct && aiPct >= dfPct) {
            prediction = "AI FAKE";
            badgeClass = "verdict-ai";
        } else if (dfPct >= realPct && dfPct >= aiPct) {
            prediction = "DEEPFAKE";
            badgeClass = "verdict-df";
        }

        return {
            prediction,
            badgeClass,
            probs: { real: realPct, ai: aiPct, df: dfPct },
            inferenceMs,
            l2Norm,
            embedding: embeddingRaw
        };
    } finally {
        if (rawBitmap) rawBitmap.close();
    }
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
    const cameraBtn = document.getElementById('detector-camera-btn');
    const cameraCancelBtn = document.getElementById('detector-camera-cancel');
    const cameraText = document.getElementById('detector-camera-text');
    const cameraView = document.getElementById('detector-camera-view');
    const countdownEl = document.getElementById('detector-countdown');
    const inputCaption = document.getElementById('detector-input-caption');
    const telemetryWrap = document.getElementById('detector-telemetry');
    const telemetryLatency = document.getElementById('telemetry-latency');
    const telemetryNormChip = document.getElementById('telemetry-norm-chip');
    const telemetryNorm = document.getElementById('telemetry-norm');
    const barcodeWrap = document.getElementById('telemetry-barcode-wrap');
    const barcodeCanvas = document.getElementById('detector-embedding-canvas');
    const liveResult = document.getElementById('detector-live-result');

    let isInferring = false;
    let cameraStream = null;
    let cameraStarting = false;
    let cameraRequestId = 0;
    let countdownTimer = 0;

    const drawEmbeddingBarcode = (embedding) => {
        if (!barcodeCanvas || !embedding || embedding.length === 0) return;
        const bctx = barcodeCanvas.getContext('2d');
        if (!bctx) return;
        const w = barcodeCanvas.width;
        const h = barcodeCanvas.height;
        bctx.clearRect(0, 0, w, h);

        let maxAbs = 0;
        for (let i = 0; i < embedding.length; i++) {
            const a = Math.abs(embedding[i]);
            if (a > maxAbs) maxAbs = a;
        }
        const scale = maxAbs > 0 ? maxAbs : 1;
        const stride = embedding.length / w;
        for (let x = 0; x < w; x++) {
            const start = Math.floor(x * stride);
            const end = Math.max(start + 1, Math.floor((x + 1) * stride));
            let sum = 0;
            for (let i = start; i < end; i++) sum += embedding[i];
            const v = (sum / (end - start)) / scale; // -1..1
            const mag = Math.min(1, Math.abs(v) * 1.45);
            const alpha = (0.14 + mag * 0.86).toFixed(2);
            bctx.fillStyle = v >= 0 ? `rgba(56, 189, 248, ${alpha})` : `rgba(245, 158, 11, ${alpha})`;
            const barH = Math.max(2, Math.round(mag * h));
            bctx.fillRect(x, Math.round((h - barH) / 2), 1, barH);
        }
    };

    const setInputCaption = (text, isLive = false) => {
        if (!inputCaption) return;
        inputCaption.textContent = text;
        inputCaption.classList.toggle('is-live-input', isLive);
    };

    const clearTelemetry = () => {
        if (telemetryWrap) telemetryWrap.hidden = true;
        if (telemetryNormChip) telemetryNormChip.hidden = true;
        if (barcodeWrap) barcodeWrap.hidden = true;
    };

    const showTelemetry = ({ inferenceMs, l2Norm, embedding } = {}) => {
        if (!telemetryWrap || !Number.isFinite(inferenceMs)) return clearTelemetry();
        if (telemetryLatency) telemetryLatency.textContent = `${Math.round(inferenceMs)} ms`;
        if (Number.isFinite(l2Norm) && telemetryNormChip && telemetryNorm) {
            telemetryNorm.textContent = l2Norm.toFixed(2);
            telemetryNormChip.hidden = false;
        } else if (telemetryNormChip) {
            telemetryNormChip.hidden = true;
        }
        if (embedding && embedding.length > 0 && barcodeWrap && barcodeCanvas) {
            drawEmbeddingBarcode(embedding);
            barcodeWrap.hidden = false;
        } else if (barcodeWrap) {
            barcodeWrap.hidden = true;
        }
        telemetryWrap.hidden = false;
    };

    const cancelCountdown = () => {
        if (countdownTimer) {
            clearTimeout(countdownTimer);
            countdownTimer = 0;
        }
        if (countdownEl) {
            countdownEl.hidden = true;
            countdownEl.textContent = '';
        }
    };

    const setUploadButtonState = (disabled, labelText) => {
        if (uploadLabel) {
            uploadLabel.classList.toggle('is-disabled', disabled);
            uploadLabel.setAttribute('aria-disabled', disabled ? 'true' : 'false');
        }
        if (fileInput) {
            fileInput.disabled = disabled;
        }
        if (cameraBtn) {
            cameraBtn.disabled = disabled;
        }
        sampleBtns.forEach(btn => {
            btn.disabled = disabled;
        });
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

    const clearPresetSelection = () => {
        sampleBtns.forEach(b => {
            b.classList.remove('active');
            b.setAttribute('aria-pressed', 'false');
        });
    };

    const stopCamera = () => {
        cancelCountdown();
        // Invalidate any pending getUserMedia() request even before cameraStream is assigned
        cameraRequestId++;
        if (!cameraStream) return;
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
        if (cameraView) {
            cameraView.srcObject = null;
            cameraView.hidden = true;
        }
        if (cameraBtn) cameraBtn.classList.remove('is-live');
        if (cameraCancelBtn) cameraCancelBtn.hidden = true;
        if (cameraText) cameraText.textContent = 'Camera';
    };

    const selectPreset = (key) => {
        if (isInferring) return;
        const preset = PRESET_SAMPLES[key];
        if (!preset) return;
        stopCamera();
        clearTelemetry();
        setInputCaption('Preset illustration', false);
        showStatus('');
        sampleBtns.forEach(btn => {
            const active = btn.getAttribute('data-sample') === key;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
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
        const warmUp = () => { warmDetectorRuntime(); };
        uploadLabel.addEventListener('mouseenter', warmUp, { once: true });
        uploadLabel.addEventListener('focusin', warmUp, { once: true });
        uploadLabel.addEventListener('click', (e) => {
            if (isInferring) e.preventDefault();
        });
    }

    // Runs one image through the model: picked, dropped, pasted or a camera snapshot
    const analyzeFile = async (rawFile) => {
        if (!rawFile || isInferring) return;
        stopCamera();
        isInferring = true;
        setUploadButtonState(true, 'Analyzing...');

        const file = withImageName(rawFile);
        const validation = await validateImageFile(file);
        if (!validation.valid) {
            isInferring = false;
            setUploadButtonState(false, 'Test Custom Image');
            showStatus(validation.error, true);
            return;
        }

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

            clearPresetSelection();

            try {
                const res = await runRealModelOnCanvas(file, img, canvas, (statusText) => {
                    showStatus(statusText, false);
                });
                showStatus('');
                setInputCaption('Model input · 224×224 (5% crop)', true);
                updateUI(res);
                showTelemetry(res);
                if (liveResult) {
                    const topConf = Math.max(res.probs.real, res.probs.ai, res.probs.df);
                    const msNote = Number.isFinite(res.inferenceMs) ? ` in ${Math.round(res.inferenceMs)} ms` : '';
                    liveResult.textContent = `Classification complete: ${res.prediction}, ${topConf.toFixed(1)}% confidence${msNote}.`;
                }
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
    };

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files?.[0];
            fileInput.value = '';
            analyzeFile(file);
        });
    }

    // Drop an image file anywhere on the sandbox
    const carriesFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
    let dragDepth = 0;
    demoCard.addEventListener('dragenter', (e) => {
        if (!carriesFiles(e)) return;
        e.preventDefault();
        dragDepth++;
        demoCard.classList.add('is-dragover');
    });
    demoCard.addEventListener('dragover', (e) => {
        if (!carriesFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    });
    demoCard.addEventListener('dragleave', () => {
        dragDepth = Math.max(0, dragDepth - 1);
        if (dragDepth === 0) demoCard.classList.remove('is-dragover');
    });
    demoCard.addEventListener('drop', (e) => {
        if (!carriesFiles(e)) return;
        e.preventDefault();
        dragDepth = 0;
        demoCard.classList.remove('is-dragover');
        const files = [...e.dataTransfer.files];
        analyzeFile(files.find(f => f.type.startsWith('image/')) || files[0]);
    });

    // Paste an image (a screenshot, "Copy image" in another tab) anywhere on the page
    document.addEventListener('paste', (e) => {
        if (e.target instanceof Element && e.target.closest('input, textarea, [contenteditable]')) return;
        const file = [...(e.clipboardData?.files || [])].find(f => f.type.startsWith('image/'));
        if (!file) return;
        e.preventDefault();
        analyzeFile(file);
    });

    // Camera: the first click opens a live view over the canvas, the second takes the snapshot
    const startCamera = async () => {
        if (cameraStarting || isInferring) return;
        cameraStarting = true;
        const reqId = ++cameraRequestId;
        showStatus('Waiting for camera access...');
        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: false
            });
        } catch (err) {
            if (reqId === cameraRequestId) {
                showStatus(err?.name === 'NotAllowedError'
                    ? 'Camera access was blocked. Allow it in your browser to take a snapshot.'
                    : 'No camera available.', true);
            }
            return;
        } finally {
            cameraStarting = false;
        }
        // A preset, upload, or tab hide happened while waiting for permission: release the stream
        if (reqId !== cameraRequestId || document.hidden || isInferring) {
            stream.getTracks().forEach(track => track.stop());
            return;
        }
        cameraStream = stream;
        warmDetectorRuntime();
        cameraView.srcObject = cameraStream;
        cameraView.hidden = false;
        cameraView.play().catch(() => {});
        clearPresetSelection();
        cameraBtn.classList.add('is-live');
        if (cameraCancelBtn) cameraCancelBtn.hidden = false;
        cameraText.textContent = 'Take Snapshot';
        setInputCaption('Live camera preview (local only)', true);
        showStatus('Frame a face, then take the snapshot (3-2-1 countdown). Nothing leaves your browser.');
    };

    const captureSnapshotNow = () => {
        cancelCountdown();
        const vw = cameraView.videoWidth;
        const vh = cameraView.videoHeight;
        if (!vw || !vh) return;
        // The centre square the live view shows (object-fit: cover), unmirrored
        const side = Math.min(vw, vh);
        const frame = document.createElement('canvas');
        frame.width = side;
        frame.height = side;
        frame.getContext('2d').drawImage(cameraView, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, side, side);
        frame.toBlob((blob) => {
            if (blob) analyzeFile(new File([blob], 'snapshot.png', { type: 'image/png' }));
        }, 'image/png');
    };

    const takeSnapshot = () => {
        if (!cameraStream) return;
        if (countdownTimer) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !countdownEl) {
            captureSnapshotNow();
            return;
        }
        let step = 3;
        const tickCountdown = () => {
            if (!cameraStream) return cancelCountdown();
            if (step <= 0) {
                captureSnapshotNow();
                return;
            }
            countdownEl.textContent = String(step);
            countdownEl.hidden = false;
            step--;
            countdownTimer = setTimeout(tickCountdown, 750);
        };
        tickCountdown();
    };

    if (cameraBtn && cameraText && cameraView && navigator.mediaDevices?.getUserMedia) {
        cameraBtn.hidden = false;
        cameraBtn.addEventListener('click', () => {
            if (isInferring) return;
            if (cameraStream) takeSnapshot();
            else startCamera();
        });
        if (cameraCancelBtn) {
            cameraCancelBtn.addEventListener('click', stopCamera);
        }
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && cameraStream) {
                e.preventDefault();
                stopCamera();
            }
        });
        // Never leave the camera on behind a hidden or closed page
        window.addEventListener('pagehide', stopCamera);
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) stopCamera();
        });
    }

    // Initial render
    selectPreset('real');
}

function init() {
    initAmbientMesh();
    initGlobalReveal();
    initGlassParallax();
    initLibraryKeys();
    initDetectorDemo();
    loadProjectReadme();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
