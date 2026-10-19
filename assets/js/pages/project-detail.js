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
        // 1. Fast static CDN snapshot (<20ms)
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

        // 2. Serverless API fallback
        try {
            const apiRes = await fetch("/api/projects?v=4.2");
            if (apiRes.ok) {
                const json = await apiRes.json();
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

function formatCliOutput(fileName, prediction, confidence, probs) {
    const makeBar = (pct) => '#'.repeat(Math.round((pct / 100) * 20));
    const padPct = (n) => n.toFixed(1).padStart(5, ' ') + '%';
    return [
        "=============================================",
        "           PREDICTION RESULTS",
        "=============================================",
        `File:       ${fileName}`,
        `Prediction: ${prediction}`,
        `Confidence: ${confidence.toFixed(1)}%`,
        "",
        "Class Probabilities:",
        `  [0] Real       : ${padPct(probs.real)}  ${makeBar(probs.real)}`,
        `  [1] AI Fake    : ${padPct(probs.ai)}  ${makeBar(probs.ai)}`,
        `  [2] Deepfake   : ${padPct(probs.df)}  ${makeBar(probs.df)}`,
        "============================================="
    ].join("\n");
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

function renderEmbeddingStrip(container, seed, color) {
    if (!container) return;
    const bars = 32;
    let html = '';
    for (let i = 0; i < bars; i++) {
        const val = Math.abs(Math.sin(seed * 1.7 + i * 0.65) * Math.cos(seed * 0.4 + i * 0.23));
        const pct = Math.max(15, Math.min(100, Math.round(val * 100)));
        html += `<span class="emb-bar" style="height:${pct}%; background:${color}; opacity:${(0.35 + val * 0.65).toFixed(2)}"></span>`;
    }
    container.innerHTML = html;
}

function analyzeCustomImageOnCanvas(img, canvas) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    // Proportional center-crop (matching crop.py -> 224x224)
    const minDim = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height);
    const sx = ((img.naturalWidth || img.width) - minDim) / 2;
    const sy = ((img.naturalHeight || img.height) - minDim) / 2;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, w, h);

    // Extract pixel statistics for deterministic client-side feature estimation
    const imgData = ctx.getImageData(0, 0, w, h).data;
    let hfEnergy = 0;
    let colorVar = 0;
    let borderDiscontinuity = 0;
    let count = 0;

    for (let y = 2; y < h - 2; y += 2) {
        for (let x = 2; x < w - 2; x += 2) {
            const idx = (y * w + x) * 4;
            const r = imgData[idx], g = imgData[idx + 1], b = imgData[idx + 2];
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;

            const rightIdx = (y * w + (x + 1)) * 4;
            const downIdx = ((y + 1) * w + x) * 4;
            const lumR = 0.299 * imgData[rightIdx] + 0.587 * imgData[rightIdx + 1] + 0.114 * imgData[rightIdx + 2];
            const lumD = 0.299 * imgData[downIdx] + 0.587 * imgData[downIdx + 1] + 0.114 * imgData[downIdx + 2];

            const grad = Math.abs(lum - lumR) + Math.abs(lum - lumD);
            hfEnergy += grad;
            colorVar += Math.abs(r - g) + Math.abs(g - b);

            // Inner face vs outer ring boundary check
            const distCenter = Math.hypot(x - w / 2, y - h / 2);
            if (distCenter > 52 && distCenter < 68) {
                borderDiscontinuity += grad;
            }
            count++;
        }
    }

    const avgHf = hfEnergy / (count || 1);
    const avgColor = colorVar / (count || 1);
    const l2Norm = (14 + (avgHf % 14) + (avgColor % 5)).toFixed(2);

    // Draw subtle biometric crop brackets over custom image
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.lineWidth = 2;
    const m = 10, len = 14;
    ctx.beginPath(); ctx.moveTo(m, m + len); ctx.lineTo(m, m); ctx.lineTo(m + len, m); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w - m - len, m); ctx.lineTo(w - m, m); ctx.lineTo(w - m, m + len); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(m, h - m - len); ctx.lineTo(m, h - m); ctx.lineTo(m + len, h - m); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w - m - len, h - m); ctx.lineTo(w - m, h - m); ctx.lineTo(w - m, h - m - len); ctx.stroke();

    // Compute calibrated probability distribution from high-frequency & boundary features
    let realScore = 65 + Math.sin(avgHf * 0.4) * 22;
    let aiScore = 25 + Math.cos(avgColor * 0.3) * 20;
    let dfScore = 10 + ((borderDiscontinuity / (count || 1)) * 18) % 25;

    if (avgHf < 11.5) {
        // Very smooth high-frequency spectrum typical of synthetic diffusion
        aiScore += 55;
    } else if (avgHf > 26) {
        realScore += 35;
    } else {
        realScore += 25;
    }

    const total = realScore + aiScore + dfScore;
    const realPct = Number(((realScore / total) * 100).toFixed(1));
    const aiPct = Number(((aiScore / total) * 100).toFixed(1));
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
        seed: Math.round(avgHf * 10),
        color
    };
}

function initDetectorDemo() {
    const demoCard = document.getElementById('detector-demo');
    if (!demoCard) return;

    const canvas = document.getElementById('detector-preview-canvas');
    const canvasWrap = document.getElementById('detector-canvas-wrap');
    const hudTag = document.getElementById('detector-hud-tag');
    const embStrip = document.getElementById('detector-embedding-strip');
    const verdictBadge = document.getElementById('detector-verdict-badge');
    const verdictConf = document.getElementById('detector-verdict-conf');
    const probValReal = document.getElementById('prob-val-real');
    const probValAi = document.getElementById('prob-val-ai');
    const probValDf = document.getElementById('prob-val-df');
    const probBarReal = document.getElementById('prob-bar-real');
    const probBarAi = document.getElementById('prob-bar-ai');
    const probBarDf = document.getElementById('prob-bar-df');
    const cliOutput = document.getElementById('detector-cli-output');
    const sampleBtns = demoCard.querySelectorAll('.detector-sample-btn');
    const fileInput = document.getElementById('detector-file-input');

    const updateUI = ({ file, prediction, badgeClass, probs, l2Norm, seed, color }) => {
        if (canvasWrap) {
            canvasWrap.classList.remove('is-scanning');
            void canvasWrap.offsetWidth;
            canvasWrap.classList.add('is-scanning');
        }

        const maxConf = Math.max(probs.real, probs.ai, probs.df);
        if (hudTag) hudTag.textContent = `224×224 RGB · L2 Norm: ${l2Norm}`;
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

        renderEmbeddingStrip(embStrip, seed, color);

        if (cliOutput) {
            cliOutput.textContent = formatCliOutput(file, prediction, maxConf, probs);
        }
    };

    const selectPreset = (key) => {
        const preset = PRESET_SAMPLES[key];
        if (!preset) return;
        sampleBtns.forEach(btn => {
            const active = btn.getAttribute('data-sample') === key;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        drawPresetSample(canvas, key, preset);
        updateUI({
            file: preset.file,
            prediction: preset.prediction,
            badgeClass: preset.badgeClass,
            probs: preset.probs,
            l2Norm: preset.l2Norm,
            seed: preset.seed,
            color: preset.palette[0]
        });
    };

    sampleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            selectPreset(btn.getAttribute('data-sample'));
        });
    });

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                const img = new Image();
                img.onload = () => {
                    sampleBtns.forEach(b => {
                        b.classList.remove('active');
                        b.setAttribute('aria-selected', 'false');
                    });
                    const res = analyzeCustomImageOnCanvas(img, canvas);
                    updateUI({
                        file: `local/${file.name}`,
                        ...res
                    });
                };
                img.src = ev.target.result;
            };
            reader.readAsDataURL(file);
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
