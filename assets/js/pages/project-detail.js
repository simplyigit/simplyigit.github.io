import { initAmbientMesh, initGlobalReveal, initGlassParallax } from '../modules/core.js';

function init() {
    initAmbientMesh();
    initGlobalReveal();
    initGlassParallax();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

