/* ===================================
   Finia - Red de seguridad
   ===================================
   Para que la app aguante a mucha gente sin que se vea rota:
   - Errores inesperados: el usuario ve un aviso claro (no una app muda) y el
     error te llega solo como un reporte tipo "bug" en la tabla `feedback`
     (Table Editor -> feedback; los automaticos empiezan con "[auto]").
   - Sin internet: franja de aviso y mensajes en espanol sencillo.
   - Doble toque: un formulario no se envia dos veces seguidas.
   - Montos: validacion comun (numero, mayor que 0, no absurdamente grande).
   Este archivo se carga PRIMERO para atrapar tambien los errores de los demas. */

const FinanzSafety = (() => {
    const MAX_REPORTS_PER_SESSION = 5;   // para no inundar la tabla si algo falla en bucle
    const TOAST_GAP_MS = 15000;          // un aviso al usuario cada 15 s como maximo
    const REPORT_DELAY_MS = 2500;
    const MAX_AMOUNT = 1e9;
    const LOCK_TIMEOUT_MS = 20000;       // tope que puede estar "ocupado" un formulario

    const seen = new Set();
    let reports = 0;
    let lastToast = 0;
    let sending = false;

    // Ruido que no es un fallo de la app (y avisar solo asustaria al usuario)
    const NOISE = [
        /ResizeObserver loop/i,
        /^Script error\.?$/i,
        /AbortError/i,
        /The user aborted a request/i,
        /The operation was aborted/i,
        /Non-Error promise rejection captured/i,
        /NotAllowedError/i,                 // permisos de notificaciones/sonido denegados por el usuario
        /play\(\) failed because the user didn't interact/i
    ];
    const NETWORK = /Failed to fetch|Load failed|NetworkError|Network request failed|fetch failed|The network connection was lost|Internet connection appears to be offline/i;
    const OFFLINE_TEXT = 'Sin conexión. Revisa tu internet e intenta de nuevo.';

    const hasDom = typeof document !== 'undefined' && typeof window !== 'undefined';

    function messageOf(x) {
        if (x === null || x === undefined) return 'Error desconocido';
        if (typeof x === 'string') return x;
        return x.message || x.error_description || x.msg || x.details || String(x);
    }

    const isNetworkMessage = msg => NETWORK.test(String(msg || ''));
    const isNoise = msg => NOISE.some(re => re.test(String(msg || '')));

    // Cambia los mensajes tecnicos de red por uno entendible
    function friendly(msg) {
        if (typeof msg !== 'string') return msg;
        return isNetworkMessage(msg) ? OFFLINE_TEXT : msg;
    }

    // Monto valido: devuelve el texto del error, o null si esta bien
    function amountError(n, { allowZero = false, max = MAX_AMOUNT } = {}) {
        if (typeof n !== 'number' || !isFinite(n)) return 'Ingresa un monto válido';
        if (allowZero ? n < 0 : n <= 0) return allowZero ? 'El monto no puede ser negativo' : 'El monto debe ser mayor que 0';
        if (n > max) return 'El monto es demasiado grande';
        return null;
    }

    // Envuelve un manejador de formulario para que no corra dos veces a la vez
    // (doble toque en "Guardar" duplicaba movimientos y transferencias).
    function once(fn, { timeoutMs = LOCK_TIMEOUT_MS } = {}) {
        let busy = false;
        return async function guarded(e) {
            if (busy) {
                if (e && typeof e.preventDefault === 'function') e.preventDefault();
                return undefined;
            }
            busy = true;
            // Si el servidor se cuelga, el formulario no puede quedar bloqueado para siempre
            const unlock = setTimeout(() => { busy = false; }, timeoutMs);
            let btn = null;
            let disabledByUs = false;
            try {
                if (e) {
                    btn = e.submitter || (e.target && e.target.querySelector && e.target.querySelector('button[type="submit"]'));
                    if (btn && !btn.disabled) { btn.disabled = true; disabledByUs = true; }
                }
            } catch (_) { /* sin boton: solo queda el bloqueo */ }
            try {
                return await fn.apply(this, arguments);
            } finally {
                clearTimeout(unlock);
                busy = false;
                if (disabledByUs && btn) btn.disabled = false;
            }
        };
    }

    // ----- Avisos en pantalla -----
    function toast(message) {
        const now = Date.now();
        if (now - lastToast < TOAST_GAP_MS) return;
        lastToast = now;
        if (hasDom && typeof window.showToast === 'function') window.showToast(message);
    }

    function banner(id, text, { actionLabel = null, onAction = null } = {}) {
        if (!hasDom) return null;
        let el = document.getElementById(id);
        if (!el) {
            el = document.createElement('div');
            el.id = id;
            el.className = 'safety-banner';
            el.setAttribute('role', 'status');
            const span = document.createElement('span');
            el.appendChild(span);
            if (actionLabel) {
                const b = document.createElement('button');
                b.type = 'button';
                b.textContent = actionLabel;
                b.addEventListener('click', onAction);
                el.appendChild(b);
            }
            document.body.appendChild(el);
        }
        el.firstChild.textContent = text;
        el.classList.add('visible');
        return el;
    }

    function hideBanner(id) {
        if (!hasDom) return;
        const el = document.getElementById(id);
        if (el) el.classList.remove('visible');
    }

    // ----- Reporte automatico (tabla feedback, tipo "bug") -----
    function appVersion() {
        try {
            const s = [...document.scripts].find(x => /js\/safety\.js/.test(x.src));
            const m = s && s.src.match(/[?&]v=([^&]+)/);
            return m ? m[1] : 'dev';
        } catch (_) { return 'dev'; }
    }

    function buildContext(kind, err, extra) {
        const ctx = {
            auto: true,
            kind,
            page: typeof window.currentPage === 'string' ? window.currentPage : null,
            path: location.pathname,
            version: appVersion(),
            online: navigator.onLine,
            viewport: `${window.innerWidth}x${window.innerHeight}`,
            standalone: !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches),
            ua: String(navigator.userAgent || '').slice(0, 160),
            at: new Date().toISOString()
        };
        if (err && err.stack) ctx.stack = String(err.stack).slice(0, 900);
        if (extra) Object.assign(ctx, extra);
        return ctx;
    }

    function scheduleReport(kind, err, msg, extra) {
        const sig = `${kind}|${msg}|${(extra && extra.source) || ''}|${(extra && extra.line) || ''}`;
        if (seen.has(sig) || reports >= MAX_REPORTS_PER_SESSION) return;
        seen.add(sig);
        reports++;
        setTimeout(async () => {
            try {
                if (sending || !window.FinanzData || !window.FinanzData.user || navigator.onLine === false) return;
                sending = true;
                await window.FinanzData.sendFeedback({
                    type: 'bug',
                    message: `[auto] ${msg}`.slice(0, 500),
                    context: buildContext(kind, err, extra)
                });
            } catch (_) {
                /* si el reporte falla no pasa nada: jamas debe causar otro error */
            } finally {
                sending = false;
            }
        }, REPORT_DELAY_MS);
    }

    // Punto de entrada para cualquier error inesperado
    function handle(kind, err, extra) {
        try {
            const msg = messageOf(err);
            if (isNoise(msg)) return;
            console.error(`[Finia ${kind}]`, err);
            if (isNetworkMessage(msg)) {
                toast(OFFLINE_TEXT);
                return; // problema de conexion, no un bug: no se reporta
            }
            toast('Algo no salió bien. Intenta de nuevo; si se repite, cierra y abre la app.');
            scheduleReport(kind, err, msg, extra);
        } catch (_) { /* el manejador de errores nunca debe fallar */ }
    }

    // ----- Conexion -----
    function showOffline() {
        banner('offline-banner', 'Sin conexión: tus cambios no se guardarán hasta que vuelva el internet.');
    }

    function onOnline() {
        hideBanner('offline-banner');
        if (typeof window.showToast === 'function') window.showToast('Conexión recuperada');
        // Se vuelve a pintar lo que se esta viendo con datos frescos
        try {
            if (window.FinanzData && window.FinanzData.user && typeof window.navigateTo === 'function' && window.currentPage) {
                window.navigateTo(window.currentPage);
            }
        } catch (_) { /* ignorar */ }
    }

    if (hasDom) {
        // Errores de JavaScript
        window.addEventListener('error', e => {
            // Un <script>/<link> que no cargo (CDN caido o sin internet): la app puede quedar a medias
            const t = e.target;
            if (t && t !== window && t.tagName && /^(SCRIPT|LINK)$/.test(t.tagName)) {
                const url = t.src || t.href || '';
                console.error('[Finia] No cargó un recurso:', url);
                banner('load-banner', 'No se pudo cargar una parte de la app. Revisa tu internet.', {
                    actionLabel: 'Recargar',
                    onAction: () => location.reload()
                });
                return;
            }
            handle('error', e.error || e.message, { source: String(e.filename || '').split('/').pop(), line: e.lineno, col: e.colno });
        }, true);

        // Promesas que fallaron sin que nadie las atrapara (el caso mas comun con Supabase)
        window.addEventListener('unhandledrejection', e => {
            handle('promise', e.reason);
        });

        window.addEventListener('offline', showOffline);
        window.addEventListener('online', onOnline);
        // Una consulta de datos fallo (ver FinanzData._readFailed)
        window.addEventListener('finia:read-error', () => {
            if (navigator.onLine === false) return; // ya se ve la franja de "sin conexion"
            toast('No se pudieron cargar tus datos. Revisa tu conexión e intenta de nuevo.');
        });

        const start = () => { if (navigator.onLine === false) showOffline(); };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
        else start();
    }

    return { friendly, handle, amountError, once, isNetworkMessage, isNoise, messageOf, MAX_AMOUNT };
})();

if (typeof window !== 'undefined') window.FinanzSafety = FinanzSafety;
if (typeof module !== 'undefined' && module.exports) module.exports = FinanzSafety;
