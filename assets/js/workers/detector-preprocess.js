// Runs the detector's Pillow-exact resize and ImageNet normalization off the main thread,
// so a large upload doesn't freeze scrolling or the scan animation
import { pillowResizeBilinear, normalizeToTensor } from '../modules/pillow-resize.js';

self.onmessage = ({ data: { pixels, srcW, srcH, outW, outH } }) => {
    const rgb = pillowResizeBilinear(pixels, srcW, srcH, outW, outH);
    const tensor = normalizeToTensor(rgb, outW, outH);
    self.postMessage({ rgb, tensor }, [rgb.buffer, tensor.buffer]);
};
