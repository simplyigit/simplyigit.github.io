import { initAmbientMesh, initGlobalReveal, initGlassParallax, observer } from '../modules/core.js';

document.addEventListener("DOMContentLoaded", () => {
    initAmbientMesh();
    initGlobalReveal();
    initGlassParallax();

    const artistsContainer = document.getElementById("spotify-artists-container");
    const tracksContainer = document.getElementById("spotify-tracks-container");

    if (artistsContainer || tracksContainer) {
        fetch("/api/spotify?v=4.0")
            .then(res => res.json())
            .then(json => {
                if (!json.success || !json.data) return;
                const { top_artists_last_month: artists, top_tracks_last_month: tracks } = json.data;

                if (artistsContainer) {
                    artistsContainer.innerHTML = artists.map((artist, index) => `
                        <a href="${artist.spotify_url || "#"}" target="_blank" rel="noopener noreferrer" class="spotify-artist-item fade-in delay-${(index % 3) + 1}">
                            <div class="artist-img-wrapper">
                                <img src="${artist.image_url || ""}" alt="${artist.name}" class="spotify-artist-img">
                                <div class="artist-playcount-overlay">
                                    <span class="artist-playcount-value">${Number(artist.playcount).toLocaleString()}</span>
                                    <span class="artist-playcount-label">Plays</span>
                                </div>
                            </div>
                            <span class="spotify-artist-name">${artist.name}</span>
                        </a>`).join('');
                }

                if (tracksContainer) {
                    tracksContainer.innerHTML = tracks.map((track, index) => {
                        const isTop = index === 0;
                        const rankTag = !isTop ? `<span class="stats-badge">#${index + 1}</span>` : `<span class="stats-badge">#1 THIS MONTH</span>`;
                        let lyricHtml = '';
                        if (isTop && track.ai_lyrics) {
                            const lyrics = [track.ai_lyrics.lyric1, track.ai_lyrics.lyric2, track.ai_lyrics.lyric3].filter(Boolean);
                            console.log("Top track lyrics found:", lyrics);
                            if (lyrics.length > 0) {
                                const randomLyric = lyrics[Math.floor(Math.random() * lyrics.length)];
                                lyricHtml = `<div class="track-ai-lyric">"${randomLyric}"</div>`;
                            }
                        } else if (isTop) {
                            console.warn("Top track has no AI lyrics in data.");
                        }

                        return `
                            <a id="track-card-${index}" href="${track.spotify_url || "#"}" target="_blank" rel="noopener noreferrer" class="spotify-track-card ${isTop ? 'top-track-banner' : 'grid-track'} fade-in delay-${(index % 4) + 1}" style="${isTop ? `--track-art: url('${track.cover_url}')` : ''}">
                                ${isTop ? `<div class="banner-bg-blur"></div>` : ''}
                                <div class="case-art-wrapper">
                                    <img src="${track.cover_url || ""}" alt="${track.title}" class="spotify-track-img">
                                </div>
                                <div class="case-info">
                                    <div class="track-text-stack">
                                        <span class="case-title">${track.title}</span>
                                        <span class="case-artist">${track.artist}</span>
                                    </div>
                                    ${lyricHtml}
                                    <div class="track-stats-pill">${rankTag}<div class="stats-pill-divider"></div><span class="stats-plays">${Number(track.playcount).toLocaleString()} plays</span></div>
                                </div>
                            </a>`;
                    }).join('');

                    // Re-apply prominent colors from data
                    tracks.forEach((track, index) => {
                        if (track.prominent_color) {
                            const [R, G, B] = track.prominent_color;
                            const isTop = index === 0;
                            const card = document.getElementById(`track-card-${index}`);
                            if (card) {
                                card.style.setProperty('--track-color-rgb', `${R}, ${G}, ${B}`);
                                card.style.setProperty('--track-color-glow', `rgba(${R}, ${G}, ${B}, ${isTop ? 0.6 : 0.45})`);
                                if (isTop) card.style.borderColor = `rgba(${R}, ${G}, ${B}, 0.3)`;
                            }
                        }
                    });
                }
                document.querySelectorAll(".fade-in").forEach(el => observer.observe(el));
            });
    }
});
