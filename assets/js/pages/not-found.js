// The 404 page: mesh, glass card, library keys, and the address that wasn't found
import { initAmbientMesh, initGlassParallax, initLibraryKeys } from '../modules/core.js';

initAmbientMesh();
initGlassParallax();
initLibraryKeys();

// Name the address that wasn't found (textContent: the path is never parsed as HTML)
const pathEl = document.getElementById('not-found-path');
if (pathEl && location.pathname !== '/404') {
    let path = location.pathname;
    try { path = decodeURIComponent(path); } catch {}
    pathEl.textContent = path.length > 80 ? `${path.slice(0, 80)}…` : path;
}
