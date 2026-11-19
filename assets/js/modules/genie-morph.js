// True curved macOS Genie warp for cover art between the homepage and library pages.
// Renders a subdivided COLS x ROWS WebGL mesh whose edges bend along a cosine S-curve funnel
// between the small homepage object (cassette label / VHS poster) and the subpage cover.
// Automatically funnels vertically (bottom-Dock Genie) or horizontally (side-Dock Genie)
// depending on the dominant travel axis between source and destination.
// Registers window.__runGenieMorph for vt-nav.js (called from pagereveal).

const COLS = 40;
const ROWS = 40;
const DURATION_MS = 380;
const LOAD_TIMEOUT_MS = 220;

const VERTEX = `
attribute vec2 a_uv;

uniform vec2 u_viewport;
uniform vec4 u_win;        // left, top, width, height (the large subpage cover)
uniform vec4 u_dock;       // left, top, width, height (the small homepage slot)
uniform float u_u;         // 0 = flat full window, 1 = collapsed into dock
uniform float u_horizontal;// 0 = vertical funnel (like bottom Dock), 1 = horizontal funnel (like side Dock)
uniform float u_dockAfter; // 1 = dock is below (vertical) or right of (horizontal) window

varying vec2 v_uv;
varying float v_eta;
varying float v_bend;
varying float v_cross;

float sstep(float e0, float e1, float x) {
    float t = clamp((x - e0) / (e1 - e0), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
}

void main() {
    v_uv = a_uv;

    // Funnel rails curve in quickly during the first 40% of collapse (and straighten in the last 40% of expand)
    float bend = sstep(0.0, 0.40, u_u);
    v_bend = bend;

    // Map primary travel axis (p) and cross pinch axis (c) so the same Genie math works
    // for both bottom-Dock (vertical) and side-Dock (horizontal) transitions
    float pUv = mix(a_uv.y, a_uv.x, u_horizontal);
    float cUv = mix(a_uv.x, a_uv.y, u_horizontal);
    v_cross = cUv;

    float winP0 = mix(u_win.y, u_win.x, u_horizontal);
    float winP1 = winP0 + mix(u_win.w, u_win.z, u_horizontal);
    float dockP0 = mix(u_dock.y, u_dock.x, u_horizontal);
    float dockP1 = dockP0 + mix(u_dock.w, u_dock.z, u_horizontal);

    float winC0 = mix(u_win.x, u_win.y, u_horizontal);
    float winC1 = winC0 + mix(u_win.z, u_win.w, u_horizontal);
    float dockC0 = mix(u_dock.x, u_dock.y, u_horizontal);
    float dockC1 = dockC0 + mix(u_dock.z, u_dock.w, u_horizontal);

    // Leading edge (closest to dock) pulls ahead through the funnel while the far edge also moves immediately
    float towardDock = mix(1.0 - pUv, pUv, u_dockAfter);
    float lead = clamp(u_u * 1.24, 0.0, 1.0);
    float trailLate = clamp((u_u - 0.14) / 0.86, 0.0, 1.0);
    float trail = mix(u_u * 0.55, trailLate, sstep(0.0, 0.25, u_u));
    float sliceSlide = mix(trail, lead, towardDock);

    float p = mix(mix(winP0, winP1, pUv), mix(dockP0, dockP1, pUv), sliceSlide);

    // Normalized position along the travel corridor from window far edge -> dock far edge
    float pStart = mix(winP1, winP0, u_dockAfter);
    float pEnd = mix(dockP0, dockP1, u_dockAfter);
    float span = pEnd - pStart;
    float eta = abs(span) > 1.0 ? clamp((p - pStart) / span, 0.0, 1.0) : sliceSlide;
    v_eta = eta;

    // Iconic cosine S-curve funnel rails on the cross axis
    float curve = 0.5 - 0.5 * cos(3.14159265 * eta);
    float funnel = mix(sliceSlide, max(curve, sliceSlide), bend);

    float c0 = mix(winC0, dockC0, funnel);
    float c1 = mix(winC1, dockC1, funnel);
    float c = mix(c0, c1, cUv);

    float x = mix(c, p, u_horizontal);
    float y = mix(p, c, u_horizontal);

    vec2 clip = vec2(
        (x / u_viewport.x) * 2.0 - 1.0,
        1.0 - (y / u_viewport.y) * 2.0
    );
    gl_Position = vec4(clip, 0.0, 1.0);
}
`;

const FRAGMENT = `
precision mediump float;

uniform sampler2D u_tex;
uniform float u_imgAspect;
uniform vec2 u_boxSize;   // interpolated logical width, height (for object-fit: cover & corner SDF)
uniform float u_radius;   // interpolated border-radius in px

varying vec2 v_uv;
varying float v_eta;
varying float v_bend;
varying float v_cross;

void main() {
    float boxAspect = u_boxSize.x / max(u_boxSize.y, 1.0);
    vec2 scale = boxAspect > u_imgAspect
        ? vec2(1.0, u_imgAspect / boxAspect)
        : vec2(boxAspect / u_imgAspect, 1.0);
    vec2 texUv = (v_uv - 0.5) * scale + 0.5;
    vec4 color = texture2D(u_tex, texUv);

    // Subtle specular/depth shading along the curved funnel bend
    float curveShade = sin(3.14159265 * v_eta) * v_bend;
    color.rgb *= 1.0 + 0.06 * sin(3.14159265 * v_cross) * curveShade - 0.06 * curveShade;

    // Anti-aliased rounded corners matching the source/target border-radius
    vec2 p = (v_uv - 0.5) * u_boxSize;
    vec2 halfSize = u_boxSize * 0.5;
    float r = min(u_radius, min(halfSize.x, halfSize.y));
    vec2 q = abs(p) - (halfSize - vec2(r));
    float dist = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
    float alpha = 1.0 - smoothstep(-0.75, 0.75, dist);

    if (alpha <= 0.001) discard;
    gl_FragColor = vec4(color.rgb * alpha, alpha);
}
`;

function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader) || 'Shader compile error');
    }
    return shader;
}

function createGridGeometry() {
    const verts = new Float32Array((COLS + 1) * (ROWS + 1) * 2);
    let vi = 0;
    for (let r = 0; r <= ROWS; r++) {
        const v = r / ROWS;
        for (let c = 0; c <= COLS; c++) {
            verts[vi++] = c / COLS;
            verts[vi++] = v;
        }
    }
    const indices = new Uint16Array(COLS * ROWS * 6);
    let ii = 0;
    const stride = COLS + 1;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const tl = r * stride + c;
            const tr = tl + 1;
            const bl = tl + stride;
            const br = bl + 1;
            indices[ii++] = tl; indices[ii++] = bl; indices[ii++] = tr;
            indices[ii++] = tr; indices[ii++] = bl; indices[ii++] = br;
        }
    }
    return { verts, indices };
}

function findReadyCorsImg(targetEl) {
    if (targetEl.__corsImg && targetEl.__corsImg.complete && targetEl.__corsImg.naturalWidth > 0) {
        return targetEl.__corsImg;
    }
    const candidate = targetEl.tagName === 'IMG' ? targetEl : targetEl.querySelector?.('img');
    if (candidate && candidate.crossOrigin && candidate.complete && candidate.naturalWidth > 0) {
        return candidate;
    }
    return null;
}

function loadImageFast(url, timeoutMs) {
    return new Promise((resolve, reject) => {
        if (!url) return reject(new Error('No image URL'));
        const img = new Image();
        if (!url.startsWith('data:')) img.crossOrigin = 'anonymous';
        img.src = url;
        if (img.complete && img.naturalWidth > 0) return resolve(img);
        let settled = false;
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            reject(new Error('Timed out'));
        }, timeoutMs);
        img.onload = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(img);
        };
        img.onerror = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            reject(new Error('Image load failed'));
        };
    });
}

// Fast, punchy launch with a silky settle (zero dead-zone on Frame 1)
function easeGenie(t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return 1 - Math.pow(1 - t, 2.8);
}

function waitForTargetReady(targetEl, timeoutMs = 600) {
    const img = targetEl.__bgImg
        || (targetEl.tagName === 'IMG' ? targetEl : targetEl.querySelector?.('img'));
    if (!img) return Promise.resolve();
    const waitDecode = () => (typeof img.decode === 'function' ? img.decode().catch(() => {}) : Promise.resolve());
    const ready = (img.complete && img.naturalWidth > 0)
        ? waitDecode()
        : new Promise((resolve) => {
            const done = () => waitDecode().then(resolve);
            img.addEventListener('load', done, { once: true });
            img.addEventListener('error', resolve, { once: true });
        });
    return Promise.race([ready, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
}

function getBorderRadius(el) {
    if (!el) return 6;
    return parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
}

let activeCleanup = null;

export function runGenieMorph({ targetEl, fromRect, fromRadius = 6, imgUrl, dataUrl, dir }) {
    if (!targetEl || !fromRect || (!dataUrl && !imgUrl)) return false;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;

    if (activeCleanup) activeCleanup();

    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true });
    if (!gl) return false;

    let program, vbo, ibo, tex;
    let indexCount = 0;
    try {
        program = gl.createProgram();
        gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, VERTEX));
        gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false;

        const { verts, indices } = createGridGeometry();
        indexCount = indices.length;

        vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

        ibo = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    } catch {
        return false;
    }

    // Hide destination cover with opacity (not visibility: hidden) so the browser keeps loading
    // and decoding its image/background eagerly during the 380ms Genie flight
    const prevOpacity = targetEl.style.opacity;
    const prevTransition = targetEl.style.transition;
    targetEl.style.transition = 'none';
    targetEl.style.opacity = '0';

    canvas.className = 'vt-genie-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);

    let rafId = 0;
    let cancelled = false;

    const restoreTarget = () => {
        targetEl.style.opacity = prevOpacity;
        targetEl.style.transition = prevTransition;
    };

    const cleanup = () => {
        if (cancelled) return;
        cancelled = true;
        if (rafId) cancelAnimationFrame(rafId);
        restoreTarget();
        canvas.remove();
        try {
            if (tex) gl.deleteTexture(tex);
            if (vbo) gl.deleteBuffer(vbo);
            if (ibo) gl.deleteBuffer(ibo);
            if (program) gl.deleteProgram(program);
            gl.getExtension('WEBGL_lose_context')?.loseContext();
        } catch {}
        if (activeCleanup === cleanup) activeCleanup = null;
    };
    activeCleanup = cleanup;

    const startWithImage = (img) => {
        if (cancelled || !targetEl.isConnected) return cleanup();

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        canvas.width = Math.round(vw * dpr);
        canvas.height = Math.round(vh * dpr);

        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.useProgram(program);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        const uvLoc = gl.getAttribLocation(program, 'a_uv');
        gl.enableVertexAttribArray(uvLoc);
        gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);

        tex = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        try {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        } catch {
            return cleanup();
        }

        const uViewport = gl.getUniformLocation(program, 'u_viewport');
        const uWin = gl.getUniformLocation(program, 'u_win');
        const uDock = gl.getUniformLocation(program, 'u_dock');
        const uU = gl.getUniformLocation(program, 'u_u');
        const uHorizontal = gl.getUniformLocation(program, 'u_horizontal');
        const uDockAfter = gl.getUniformLocation(program, 'u_dockAfter');
        const uTex = gl.getUniformLocation(program, 'u_tex');
        const uImgAspect = gl.getUniformLocation(program, 'u_imgAspect');
        const uBoxSize = gl.getUniformLocation(program, 'u_boxSize');
        const uRadius = gl.getUniformLocation(program, 'u_radius');

        gl.uniform1i(uTex, 0);
        gl.uniform1f(uImgAspect, (img.naturalWidth || 1) / Math.max(img.naturalHeight || 1, 1));
        gl.uniform2f(uViewport, vw, vh);

        const toRadius = getBorderRadius(targetEl);
        const isExpand = dir === 'in';
        const startTime = performance.now() - 16;

        const renderAt = (rawT) => {
            const eased = easeGenie(rawT);

            const toRect = targetEl.getBoundingClientRect();
            const winRect = isExpand ? toRect : fromRect;
            const dockRect = isExpand ? fromRect : toRect;
            const dx = (dockRect.left + dockRect.width / 2) - (winRect.left + winRect.width / 2);
            const dy = (dockRect.top + dockRect.height / 2) - (winRect.top + winRect.height / 2);
            const horizontal = Math.abs(dx) > Math.abs(dy) ? 1.0 : 0.0;
            const dockAfter = (horizontal > 0.5 ? dx : dy) >= 0 ? 1.0 : 0.0;

            const u = isExpand ? (1 - eased) : eased;
            const boxW = fromRect.width + (toRect.width - fromRect.width) * eased;
            const boxH = fromRect.height + (toRect.height - fromRect.height) * eased;
            const radius = fromRadius + (toRadius - fromRadius) * eased;

            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.uniform4f(uWin, winRect.left, winRect.top, winRect.width, winRect.height);
            gl.uniform4f(uDock, dockRect.left, dockRect.top, dockRect.width, dockRect.height);
            gl.uniform1f(uU, u);
            gl.uniform1f(uHorizontal, horizontal);
            gl.uniform1f(uDockAfter, dockAfter);
            gl.uniform2f(uBoxSize, Math.max(1, boxW), Math.max(1, boxH));
            gl.uniform1f(uRadius, radius);
            gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_SHORT, 0);
        };

        const tick = (now) => {
            if (cancelled || !targetEl.isConnected) return cleanup();
            const rawT = Math.min(1, (now - startTime) / DURATION_MS);
            renderAt(rawT);

            if (rawT < 1) {
                rafId = requestAnimationFrame(tick);
            } else {
                // Keep the final resting frame painted until the real DOM image/background has decoded,
                // so the destination never flashes empty or pops in after the Genie lands
                waitForTargetReady(targetEl).then(() => {
                    if (cancelled) return;
                    restoreTarget();
                    rafId = requestAnimationFrame(cleanup);
                });
            }
        };

        renderAt(Math.min(1, 16 / DURATION_MS));
        rafId = requestAnimationFrame(tick);
    };

    const readyDomImg = findReadyCorsImg(targetEl);
    if (readyDomImg) {
        startWithImage(readyDomImg);
    } else if (dataUrl) {
        loadImageFast(dataUrl, LOAD_TIMEOUT_MS).then(startWithImage).catch(() => {
            loadImageFast(imgUrl, LOAD_TIMEOUT_MS).then(startWithImage).catch(cleanup);
        });
    } else {
        loadImageFast(imgUrl, LOAD_TIMEOUT_MS).then(startWithImage).catch(cleanup);
    }

    return true;
}

window.__runGenieMorph = runGenieMorph;
