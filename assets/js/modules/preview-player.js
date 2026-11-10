// One shared <audio> for the 30-second track previews (homepage cassette, music page track cards).
// Only one preview plays at a time; starting another stops the first.

const VOLUME = 0.7;

let audio = null;
let current = null; // { owner, onChange }

function notify(state) {
    if (current) current.onChange(state);
}

function ensureAudio() {
    if (audio) return audio;
    audio = new Audio();
    audio.preload = 'none';
    audio.volume = VOLUME;
    audio.addEventListener('timeupdate', () => {
        const duration = audio.duration;
        if (!current || !Number.isFinite(duration) || duration <= 0) return;
        notify({
            playing: true,
            progress: Math.min(1, audio.currentTime / duration),
            remaining: Math.max(0, Math.ceil(duration - audio.currentTime))
        });
    });
    audio.addEventListener('ended', stopPreview);
    audio.addEventListener('error', stopPreview);
    // Leaving the page (or it going into the back/forward cache) must not leave audio running
    window.addEventListener('pagehide', stopPreview);
    return audio;
}

export function stopPreview() {
    if (!current) return;
    const stopped = current;
    current = null;
    audio.pause();
    stopped.onChange({ playing: false, progress: 0, remaining: 0 });
}

// `owner` identifies the control (any value): toggling the owner that is playing stops it.
// `onChange({ playing, progress, remaining })` is called on start, while playing and on stop.
export function togglePreview(owner, url, onChange) {
    const wasPlaying = current && current.owner === owner;
    stopPreview();
    if (wasPlaying || !url) return;

    const player = ensureAudio();
    current = { owner, onChange };
    player.src = url;
    notify({ playing: true, progress: 0, remaining: 30 });
    player.play().catch(() => {
        // Blocked or unplayable: reset the control
        if (current && current.owner === owner) stopPreview();
    });
}
