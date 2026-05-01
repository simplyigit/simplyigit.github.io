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

    const updateMesh = () => {
        const y1 = 20 + (scrollPercent * 40) + ((currentMouseY - 0.5) * 10);
        const x1 = 20 + ((currentMouseX - 0.5) * 10);
        const y2 = 80 - (scrollPercent * 50) + ((currentMouseY - 0.5) * -15);
        const x2 = 80 + ((currentMouseX - 0.5) * -15);
        const y3 = 50 + (scrollPercent * 30) + ((currentMouseY - 0.5) * 8);
        const x3 = 50 + (scrollPercent * 20) + ((currentMouseX - 0.5) * 12);

        const ambientMesh = document.getElementById('ambient-mesh');
        if (ambientMesh) {
            ambientMesh.style.setProperty('--bg-y1', `${y1}vh`);
            ambientMesh.style.setProperty('--bg-x1', `${x1}vw`);
            ambientMesh.style.setProperty('--bg-y2', `${y2}vh`);
            ambientMesh.style.setProperty('--bg-x2', `${x2}vw`);
            ambientMesh.style.setProperty('--bg-y3', `${y3}vh`);
            ambientMesh.style.setProperty('--bg-x3', `${x3}vw`);
        }
        ticking = false;
    };

    window.addEventListener('scroll', () => {
        const scrolled = window.scrollY;
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        scrollPercent = maxScroll > 0 ? scrolled / maxScroll : 0;
        if (!ticking) {
            window.requestAnimationFrame(updateMesh);
            ticking = true;
        }
    });

    window.addEventListener('mousemove', (e) => {
        currentMouseX = e.clientX / window.innerWidth;
        currentMouseY = e.clientY / window.innerHeight;
        if (!ticking) {
            window.requestAnimationFrame(updateMesh);
            ticking = true;
        }
    });
}

export function initGlassParallax() {
    const handleOnMouseMove = e => {
        const { currentTarget: target } = e;
        const rect = target.getBoundingClientRect(),
            x = e.clientX - rect.left,
            y = e.clientY - rect.top;

        target.style.setProperty("--mouse-x", `${x}px`);
        target.style.setProperty("--mouse-y", `${y}px`);

        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const rotateX = ((y - centerY) / centerY) * -4;
        const rotateY = ((x - centerX) / centerX) * 4;

        target.style.transition = 'none';
        target.style.transform = `perspective(1200px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
    };

    const cards = document.querySelectorAll('.glass-card');
    for (const card of cards) {
        card.addEventListener('mousemove', handleOnMouseMove);
        card.addEventListener('mouseleave', () => {
            card.style.transform = `perspective(1200px) rotateX(0) rotateY(0) scale3d(1, 1, 1)`;
            card.style.transition = 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1), box-shadow 0.4s ease, border-color 0.4s ease';
        });
    }
}
