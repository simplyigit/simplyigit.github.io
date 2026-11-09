// Detector preprocessing shared by project-detail.js and its worker (workers/detector-preprocess.js)

// Training used torchvision's Resize((224, 224)) on PIL images, i.e. Pillow's antialiased bilinear
// filter. The canvas's own scaling uses a different filter and visibly shifts the model's output, so
// this reproduces Pillow's Resample.c (fixed-point weights, 8-bit intermediate pass) exactly.
const PRECISION_BITS = 22; // 32 - 8 - 2, as in Pillow

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
export function pillowResizeBilinear(src, srcW, srcH, outW, outH) {
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

// Packed RGB (w x h) -> NCHW Float32Array [1, 3, h, w] with ImageNet normalization
export function normalizeToTensor(rgb, w, h) {
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
    return tensorData;
}
