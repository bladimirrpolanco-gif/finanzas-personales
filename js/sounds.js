/* ===================================
   Finia - Sonidos de la app
   ===================================
   Los sonidos se generan con Web Audio (sin archivos de audio): no pesan,
   no tienen derechos de autor y el tono se ajusta aqui mismo.

   Regla de los navegadores moviles (iPhone incluido): el audio solo se puede
   iniciar dentro de un toque del usuario. Como el sonido de "guardado" suena
   DESPUES de esperar al servidor, se "desbloquea" el audio en el primer toque
   de cualquier parte de la app y luego ya puede sonar cuando haga falta. */

const FinanzSound = (() => {
    const STORAGE_KEY = 'finia-sounds';
    const MASTER_VOLUME = 0.85; // suave pero claro en el parlante del celular
    let ctx = null;
    let master = null;

    function isEnabled() {
        try {
            return localStorage.getItem(STORAGE_KEY) !== 'off'; // encendido de inicio
        } catch (_) {
            return true;
        }
    }

    function setEnabled(on) {
        try {
            localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
        } catch (_) { /* sin almacenamiento: queda solo en esta sesion */ }
    }

    function getContext() {
        if (ctx) return ctx;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        try {
            ctx = new AC();
            master = ctx.createGain();
            master.gain.value = MASTER_VOLUME;
            master.connect(ctx.destination);
        } catch (_) {
            ctx = null;
        }
        return ctx;
    }

    // 1 segundo de silencio como WAV (data URI), para el truco del interruptor de silencio de iOS
    function silentWavUri() {
        const sampleRate = 8000, samples = 8000;
        const buf = new ArrayBuffer(44 + samples);
        const v = new DataView(buf);
        const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
        str(0, 'RIFF'); v.setUint32(4, 36 + samples, true); str(8, 'WAVE'); str(12, 'fmt ');
        v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
        v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate, true);
        v.setUint16(32, 1, true); v.setUint16(34, 8, true); str(36, 'data'); v.setUint32(40, samples, true);
        new Uint8Array(buf, 44).fill(128); // 128 = silencio en WAV de 8 bits
        let bin = '';
        new Uint8Array(buf).forEach(b => { bin += String.fromCharCode(b); });
        return 'data:audio/wav;base64,' + btoa(bin);
    }

    let silentEl = null;

    // Se llama dentro de un toque real: crea/reactiva el audio (iOS lo suspende al minimizar la app)
    function unlock() {
        // iOS 16.4+: pedir que el audio cuente como "reproduccion" para que suene aunque el
        // celular tenga el interruptor de silencio (si no, el audio web queda mudo)
        try {
            if (navigator.audioSession) navigator.audioSession.type = 'playback';
        } catch (_) { /* no soportado */ }

        // iOS anteriores: un <audio> en silencio pasa el audio a modo "reproduccion"
        if (!silentEl) {
            try {
                silentEl = new Audio(silentWavUri());
                silentEl.setAttribute('playsinline', '');
            } catch (_) { silentEl = null; }
        }
        if (silentEl && silentEl.paused) {
            try { silentEl.play().catch(() => {}); } catch (_) { /* ignorar */ }
        }

        const c = getContext();
        if (!c) return;
        if (c.state !== 'running') c.resume().catch(() => {});
        // iOS solo da por "desbloqueado" el audio si dentro del toque se empieza a sonar algo real
        try {
            const src = c.createBufferSource();
            src.buffer = c.createBuffer(1, 1, 22050);
            src.connect(c.destination);
            src.start(0);
        } catch (_) { /* ignorar */ }
    }

    // Una nota: seno con ataque rapido y caida exponencial (suena a campanita/gota)
    function tone({ freq, endFreq, start = 0, duration = 0.3, peak = 0.3, type = 'sine' }) {
        const t0 = ctx.currentTime + start;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0);
        if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + duration);
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
        osc.connect(gain);
        gain.connect(master);
        osc.start(t0);
        osc.stop(t0 + duration + 0.05);
    }

    const SOUNDS = {
        // Ingreso: dos notas que suben, como una campanita ("entro dinero")
        income() {
            tone({ freq: 659.25, start: 0, duration: 0.28, peak: 0.28 });          // Mi5
            tone({ freq: 987.77, start: 0.09, duration: 0.42, peak: 0.26 });       // Si5
            tone({ freq: 1975.5, start: 0.09, duration: 0.30, peak: 0.05 });       // brillo
        },
        // Gasto: un "tic" grave y discreto, una sola nota que baja
        expense() {
            tone({ freq: 392, endFreq: 262, start: 0, duration: 0.18, peak: 0.30 }); // Sol4 -> Do4
        }
    };

    function play(name, { force = false } = {}) {
        if (!force && !isEnabled()) return;
        const sound = SOUNDS[name];
        if (!sound) return;
        const c = getContext();
        if (!c) return;
        const run = () => { try { sound(); } catch (_) { /* un sonido nunca debe romper la app */ } };
        if (c.state === 'running') {
            run();
        } else {
            // Aun suspendido (no hubo toque previo): se intenta; si el navegador no deja, simplemente no suena
            c.resume().then(run).catch(() => {});
        }
    }

    // Desbloqueo en el primer toque (y de nuevo si el sistema suspende el audio despues)
    // iOS solo cuenta como "toque valido para audio" touchend/click (no pointerdown/touchstart)
    ['pointerdown', 'touchend', 'click', 'keydown'].forEach(evt => {
        document.addEventListener(evt, unlock, { capture: true, passive: true });
    });

    return { isEnabled, setEnabled, play, unlock };
})();

// Interruptor de Perfil > Sonidos
function syncSoundSwitch() {
    const sw = document.getElementById('sound-switch');
    if (!sw) return;
    const on = FinanzSound.isEnabled();
    sw.classList.toggle('on', on);
    sw.setAttribute('aria-checked', on ? 'true' : 'false');
    const label = document.getElementById('sound-switch-label');
    if (label) label.textContent = on ? 'Activados al guardar ingresos y gastos' : 'Desactivados';
}

function toggleSounds() {
    const next = !FinanzSound.isEnabled();
    FinanzSound.setEnabled(next);
    syncSoundSwitch();
    if (next) {
        // Al encender se oyen los dos sonidos, para que sepa como suenan
        FinanzSound.unlock();
        FinanzSound.play('income', { force: true });
        setTimeout(() => FinanzSound.play('expense', { force: true }), 650);
    }
}

window.FinanzSound = FinanzSound;
window.toggleSounds = toggleSounds;
window.syncSoundSwitch = syncSoundSwitch;
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncSoundSwitch);
} else {
    syncSoundSwitch();
}
