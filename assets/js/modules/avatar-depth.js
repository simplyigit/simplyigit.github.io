// Fake-3D memoji: a WebGL shader shifts each pixel of the avatar by its depth (a grayscale depth map)
// as the pointer moves, so near parts (nose, face) travel further than far ones and the head appears to
// turn toward the pointer. The <img> stays in place for layout and alt text; without WebGL, or with
// reduced motion, nothing changes.

const VERTEX = `
attribute vec2 position;
varying vec2 uv;
void main() {
    uv = (position + 1.0) * 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
}`;

// Two passes: the second reads depth at the shifted position, which keeps edges from tearing
const FRAGMENT = `
precision mediump float;
uniform sampler2D image;
uniform sampler2D depth;
uniform vec2 pointer;
varying vec2 uv;
const float FOCUS = 0.35;   // depth that stays put: nearer moves with the pointer, farther against it
const float STRENGTH = 0.055;
void main() {
    vec2 shift = pointer * (texture2D(depth, uv).r - FOCUS) * STRENGTH;
    shift = pointer * (texture2D(depth, uv - shift).r - FOCUS) * STRENGTH;
    gl_FragColor = texture2D(image, uv - shift);
}`;

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

function compile(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
}

function texture(gl, unit, source) {
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
}

export async function initAvatarDepth(img, depthSrc) {
    if (!img || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false });
    if (!gl) return;

    let color, depthMap;
    try {
        [color, depthMap] = await Promise.all([loadImage(img.currentSrc || img.src), loadImage(depthSrc)]);
    } catch {
        return;
    }
    canvas.width = color.naturalWidth;
    canvas.height = color.naturalHeight;

    let program;
    try {
        program = gl.createProgram();
        gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
        gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    } catch {
        return;
    }
    gl.useProgram(program);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true); // no dark fringes on the transparent edge
    texture(gl, 0, color);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    texture(gl, 1, depthMap);
    gl.uniform1i(gl.getUniformLocation(program, 'image'), 0);
    gl.uniform1i(gl.getUniformLocation(program, 'depth'), 1);
    const pointerLoc = gl.getUniformLocation(program, 'pointer');

    const current = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };
    let frame = 0;

    const draw = () => {
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(pointerLoc, current.x, current.y);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    // Ease toward the pointer and stop the loop once settled
    const tick = () => {
        current.x += (target.x - current.x) * 0.12;
        current.y += (target.y - current.y) * 0.12;
        draw();
        frame = Math.abs(target.x - current.x) + Math.abs(target.y - current.y) > 0.001 ? requestAnimationFrame(tick) : 0;
    };
    const follow = () => {
        if (!frame) frame = requestAnimationFrame(tick);
    };

    // The canvas sits exactly over the image; the image stays for layout and alt text
    const wrap = document.createElement('span');
    wrap.className = 'avatar-3d';
    img.replaceWith(wrap);
    wrap.append(img, canvas);
    canvas.className = `${img.className} avatar-depth`;
    canvas.setAttribute('aria-hidden', 'true');
    draw();
    wrap.classList.add('is-live');

    // Anywhere on the page: the head turns toward the pointer, fully at ~400px away
    window.addEventListener('pointermove', e => {
        if (e.pointerType !== 'mouse') return;
        const rect = canvas.getBoundingClientRect();
        target.x = Math.max(-1, Math.min(1, (e.clientX - (rect.left + rect.width / 2)) / 400));
        target.y = Math.max(-1, Math.min(1, -(e.clientY - (rect.top + rect.height / 2)) / 400));
        follow();
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => {
        target.x = 0;
        target.y = 0;
        follow();
    });
}
