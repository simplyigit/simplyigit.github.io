// Core shared utilities and global observers
export const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('active');
            observer.unobserve(entry.target);
        }
    });
}, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

export function initGlobalReveal() {
    document.querySelectorAll('.glass-card, .section-title, .hero p, .social-tube, .fade-in').forEach(el => {
        el.classList.add('reveal');
        observer.observe(el);
    });
}

export function initAmbientMesh() {
    // Inject hardware-accelerated ambient meshes
    if (!document.getElementById('ambient-mesh')) {
        document.body.insertAdjacentHTML('afterbegin', `
            <div id="ambient-mesh">
                <div class="orb orb-1"></div>
                <div class="orb orb-2"></div>
                <div class="orb orb-3"></div>
            </div>
        `);
    }

    let scrollPercent = 0;
    let ticking = false;
    let currentMouseX = 0.5;
    let currentMouseY = 0.5;
    let winWidth = window.innerWidth || 1920;
    let winHeight = window.innerHeight || 1080;

    const ambientMesh = document.getElementById('ambient-mesh');

    const updateMesh = () => {
        if (!ambientMesh || document.hidden) {
            ticking = false;
            return;
        }

        const y1 = 20 + (scrollPercent * 40) + ((currentMouseY - 0.5) * 10);
        const x1 = 20 + ((currentMouseX - 0.5) * 10);
        const y2 = 80 - (scrollPercent * 50) + ((currentMouseY - 0.5) * -15);
        const x2 = 80 + ((currentMouseX - 0.5) * -15);
        const y3 = 50 + (scrollPercent * 30) + ((currentMouseY - 0.5) * 8);
        const x3 = 50 + (scrollPercent * 20) + ((currentMouseX - 0.5) * 12);

        ambientMesh.style.setProperty('--bg-y1', `${y1}vh`);
        ambientMesh.style.setProperty('--bg-x1', `${x1}vw`);
        ambientMesh.style.setProperty('--bg-y2', `${y2}vh`);
        ambientMesh.style.setProperty('--bg-x2', `${x2}vw`);
        ambientMesh.style.setProperty('--bg-y3', `${y3}vh`);
        ambientMesh.style.setProperty('--bg-x3', `${x3}vw`);
        
        ticking = false;
    };

    window.addEventListener('resize', () => {
        winWidth = window.innerWidth || 1920;
        winHeight = window.innerHeight || 1080;
    }, { passive: true });

    window.addEventListener('scroll', () => {
        const scrolled = window.scrollY;
        const maxScroll = document.documentElement.scrollHeight - winHeight;
        scrollPercent = maxScroll > 0 ? scrolled / maxScroll : 0;
        if (!ticking) {
            window.requestAnimationFrame(updateMesh);
            ticking = true;
        }
    }, { passive: true });

    window.addEventListener('mousemove', (e) => {
        currentMouseX = e.clientX / winWidth;
        currentMouseY = e.clientY / winHeight;
        if (!ticking) {
            window.requestAnimationFrame(updateMesh);
            ticking = true;
        }
    }, { passive: true });
}

export function initGlassParallax() {
    const cards = document.querySelectorAll('.glass-card');
    cards.forEach(card => {
        if (card.dataset.parallaxInitialized) return;
        card.dataset.parallaxInitialized = "true";

        let rect = null;

        card.addEventListener('mouseenter', () => {
            rect = card.getBoundingClientRect();
        });

        card.addEventListener('mousemove', e => {
            if (!rect) rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            card.style.setProperty("--mouse-x", `${x}px`);
            card.style.setProperty("--mouse-y", `${y}px`);

            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const rotateX = ((y - centerY) / centerY) * -4;
            const rotateY = ((x - centerX) / centerX) * 4;

            card.style.transition = 'none';
            card.style.transform = `perspective(1200px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
        });

        card.addEventListener('mouseleave', () => {
            rect = null;
            card.style.transform = `perspective(1200px) rotateX(0) rotateY(0) scale3d(1, 1, 1)`;
            card.style.transition = 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1), box-shadow 0.4s ease, border-color 0.4s ease';
        });
    });
}

export function initMobileWarning() {
    if (sessionStorage.getItem('mobileWarningDismissed') === 'true') {
        return;
    }

    if (!document.getElementById('mobile-warning-overlay')) {
        document.body.insertAdjacentHTML('beforeend', `
            <div id="mobile-warning-overlay" class="fade-in">
                <div class="glass-card warning-card">
                    <div class="warning-icon-wrapper">
                        <svg class="warning-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect>
                            <line x1="12" y1="18" x2="12.01" y2="18"></line>
                        </svg>
                        <div class="warning-glow"></div>
                    </div>
                    <h2 class="gradient-text">Screen Too Small</h2>
                    <p>The current UI arrangement cannot be rendered properly on this device. Please use a larger screen for the complete experience.</p>
                    <button id="continue-anyway-btn" class="warning-btn">
                        <span>Continue Anyway</span>
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="arrow"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                    </button>
                </div>
            </div>
        `);

        document.getElementById('continue-anyway-btn').addEventListener('click', () => {
            const overlay = document.getElementById('mobile-warning-overlay');
            overlay.style.opacity = '0';
            overlay.style.transform = 'scale(0.95)';
            overlay.style.transition = 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
            sessionStorage.setItem('mobileWarningDismissed', 'true');
            setTimeout(() => {
                overlay.style.display = 'none';
                overlay.classList.add('dismissed');
            }, 400);
        });
    }
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMobileWarning);
    } else {
        initMobileWarning();
    }
}
