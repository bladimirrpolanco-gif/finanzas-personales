/**
 * Finia - Edge Function "send-push" (Supabase).
 *
 * Envia notificaciones push (Web Push) a los dispositivos suscritos. Dos modos:
 *   - mode "test":  lo llama la app (boton "Enviar notificacion de prueba") con
 *                   la sesion del usuario; manda un aviso de prueba a SUS
 *                   dispositivos. Sirve para comprobar que todo funciona.
 *   - mode "daily": lo llama pg_cron todos los dias (ver supabase/push_notifications.sql,
 *                   PARTE 2) con la cabecera x-cron-secret. Para cada usuario
 *                   suscrito calcula, con sus datos reales, que avisar:
 *                     * Lunes: resumen de los ultimos 7 dias.
 *                     * Presupuesto mensual general al 80% y al 100%.
 *                     * Presupuesto de cada categoria al 80% y al 100%.
 *                   Cada aviso se manda UNA sola vez (push_alert_log).
 *
 * ============  COMO DESPLEGARLA (Supabase Dashboard)  ============
 *  1. Edge Functions -> Deploy a new function -> "Via Editor". Nombre: send-push.
 *     Pega TODO este archivo y Deploy.
 *  2. Edge Functions -> Secrets, agrega:
 *       VAPID_PUBLIC_KEY   la clave PUBLICA (la misma que va en js/app.js)
 *       VAPID_PRIVATE_KEY  la clave PRIVADA (solo aqui; NUNCA en el repo ni en el chat)
 *       VAPID_SUBJECT      mailto:antoniopolancotrader@gmail.com
 *       CRON_SECRET        un texto largo y aleatorio que inventes
 *     (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya vienen incluidas.)
 *  3. Genera las claves VAPID en tu computadora con:  npx web-push generate-vapid-keys
 *  4. Corre la PARTE 2 de supabase/push_notifications.sql con tu CRON_SECRET.
 */

// ---------------------------------------------------------------------------
// Logica pura (sin red): decide que avisos corresponden. Se prueba aparte.
// ---------------------------------------------------------------------------

export const CATEGORY_LABELS: Record<string, string> = {
    food: 'Comida', transport: 'Transporte', shopping: 'Compras',
    entertainment: 'Entretenimiento', health: 'Salud', bills: 'Servicios',
    education: 'Educación', other: 'Otros'
};

// Movimientos que genera el sistema al mover dinero propio: no son gasto real
// (mismo criterio que FinanzUtils.isInternalMovement en la app).
export const INTERNAL_CATEGORIES = ['Transferencia', 'Ahorro'];

export function money(n: number): string {
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function labelFor(category: string): string {
    return CATEGORY_LABELS[category] || category;
}

// Suma YYYY-MM-DD + dias (aritmetica de calendario en UTC: sin corrimientos de zona horaria).
export function addDaysISO(iso: string, days: number): string {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// 80 o 100 si ya se llego a ese umbral y ese aviso aun no se mando; si no, null.
function pendingLevel(keyPrefix: string, pct: number, sent: Set<string>) {
    const level = pct >= 100 ? 100 : pct >= 80 ? 80 : 0;
    if (!level) return null;
    const key = `${keyPrefix}-${level}`;
    return sent.has(key) ? null : { level, key };
}

export interface DailyInput {
    todayISO: string;            // fecha de hoy en Republica Dominicana
    weekday: number;             // 0 = domingo ... 6 = sabado (en esa misma zona)
    monthlyBudget: number;       // presupuesto mensual general (0 = sin presupuesto)
    monthExpense: number;        // gasto real del mes en curso
    monthByCategory: Record<string, number>;
    catLimits: { category: string; limit: number }[];
    last7: { total: number; byCategory: Record<string, number> };
    prev7Total: number;
    sentKeys: Set<string>;
}

export interface PushAlert { key: string; title: string; body: string; tag: string }

export function computeDailyAlerts(input: DailyInput): PushAlert[] {
    const alerts: PushAlert[] = [];
    const ym = input.todayISO.slice(0, 7);

    // 1) Resumen de los ultimos 7 dias (solo los lunes)
    if (input.weekday === 1 && input.last7.total > 0) {
        const key = `weekly-${input.todayISO}`;
        if (!input.sentKeys.has(key)) {
            const top = Object.entries(input.last7.byCategory).sort((a, b) => b[1] - a[1])[0];
            const share = Math.round((top[1] / input.last7.total) * 100);
            let change = '';
            if (input.prev7Total > 0) {
                const pct = ((input.last7.total - input.prev7Total) / input.prev7Total) * 100;
                change = ` (${pct >= 0 ? '↑' : '↓'} ${Math.abs(pct).toFixed(0)}% vs. los 7 días anteriores)`;
            }
            alerts.push({
                key,
                title: 'Tu resumen semanal',
                body: `Gastaste ${money(input.last7.total)} en los últimos 7 días${change}. Lo que más: ${labelFor(top[0])} (${share}%).`,
                tag: 'weekly'
            });
        }
    }

    // 2) Presupuesto mensual general
    if (input.monthlyBudget > 0) {
        const pct = (input.monthExpense / input.monthlyBudget) * 100;
        const p = pendingLevel(`budget-${ym}`, pct, input.sentKeys);
        if (p) {
            alerts.push({
                key: p.key,
                title: p.level === 100 ? 'Superaste tu presupuesto' : 'Cerca de tu límite',
                body: `Llevas ${money(input.monthExpense)} de ${money(input.monthlyBudget)} este mes (${Math.round(pct)}%).`,
                tag: 'budget'
            });
        }
    }

    // 3) Presupuesto por categoria
    for (const { category, limit } of input.catLimits) {
        if (!(limit > 0)) continue;
        const spent = input.monthByCategory[category] || 0;
        const pct = (spent / limit) * 100;
        const p = pendingLevel(`catbudget-${ym}-${category}`, pct, input.sentKeys);
        if (p) {
            alerts.push({
                key: p.key,
                title: p.level === 100 ? `Superaste el presupuesto de ${labelFor(category)}` : `Cerca del límite en ${labelFor(category)}`,
                body: `Llevas ${money(spent)} de ${money(limit)} este mes (${Math.round(pct)}%).`,
                tag: `cat-${category}`
            });
        }
    }

    return alerts;
}

// ---------------------------------------------------------------------------
// Servidor (solo corre dentro de Supabase / Deno)
// ---------------------------------------------------------------------------

const TZ = 'America/Santo_Domingo';
const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function todayInDR() {
    const now = new Date();
    const iso = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    const wd = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(now);
    return { iso, weekday: WEEKDAYS[wd] };
}

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

// `deps` solo se usa en las pruebas (para inyectar un web-push y un cliente de
// Supabase falsos); en Supabase se cargan las librerias reales.
export async function handler(req: Request, deps: any = null): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return json({ error: 'Usa POST' }, 405);

    const env = deps?.env ?? ((k: string) => (globalThis as any).Deno.env.get(k) || '');
    const webpush = deps?.webpush ?? (await import('npm:web-push@3.6.7')).default;
    const createClient = deps?.createClient ?? (await import('npm:@supabase/supabase-js@2')).createClient;

    if (!env('VAPID_PUBLIC_KEY') || !env('VAPID_PRIVATE_KEY')) {
        return json({ error: 'Faltan los secretos VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY' }, 500);
    }
    webpush.setVapidDetails(env('VAPID_SUBJECT') || 'mailto:admin@example.com', env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
    const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));

    let body: any = {};
    try { body = await req.json(); } catch { /* sin cuerpo */ }

    // Envia a una suscripcion; 'gone' = el dispositivo ya no existe (se borra)
    const sendTo = async (sub: any, payload: unknown): Promise<'ok' | 'gone' | 'error'> => {
        try {
            await webpush.sendNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                JSON.stringify(payload),
                { TTL: 60 * 60 * 12 }
            );
            return 'ok';
        } catch (e: any) {
            if (e?.statusCode === 404 || e?.statusCode === 410) {
                await admin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
                return 'gone';
            }
            console.error('push error', e?.statusCode, e?.body || e?.message);
            return 'error';
        }
    };

    // ---------------- modo test: lo pide un usuario logueado ----------------
    if (body.mode === 'test') {
        const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
        const { data: { user } } = await admin.auth.getUser(token);
        if (!user) return json({ error: 'No autorizado' }, 401);

        const { data: subs } = await admin.from('push_subscriptions').select('*').eq('user_id', user.id);
        if (!subs || subs.length === 0) return json({ sent: 0, error: 'Este usuario no tiene dispositivos suscritos' }, 404);

        const results = await Promise.all(subs.map((s: any) =>
            sendTo(s, { title: 'Finia', body: '¡Las notificaciones funcionan! 🎉', tag: 'test', url: './' })));
        return json({ sent: results.filter(r => r === 'ok').length, failed: results.filter(r => r === 'error').length, removed: results.filter(r => r === 'gone').length });
    }

    // ---------------- modo daily: lo pide pg_cron ----------------
    if (body.mode === 'daily') {
        if (!env('CRON_SECRET') || req.headers.get('x-cron-secret') !== env('CRON_SECRET')) {
            return json({ error: 'No autorizado' }, 401);
        }

        const { iso: todayISO, weekday } = todayInDR();
        const monthStart = todayISO.slice(0, 8) + '01';
        const last7Start = addDaysISO(todayISO, -6);
        const prev7Start = addDaysISO(todayISO, -13);
        const prev7End = addDaysISO(todayISO, -7);
        const fetchFrom = monthStart < prev7Start ? monthStart : prev7Start;

        const { data: allSubs } = await admin.from('push_subscriptions').select('*');
        const byUser = new Map<string, any[]>();
        (allSubs || []).forEach((s: any) => byUser.set(s.user_id, [...(byUser.get(s.user_id) || []), s]));

        const summary = { users: byUser.size, alertsSent: 0, errors: 0 };

        for (const [userId, subs] of byUser) {
            try {
                const { data: txs } = await admin.from('transactions')
                    .select('category, amount, date')
                    .eq('user_id', userId).eq('type', 'expense')
                    .gte('date', fetchFrom).lte('date', todayISO);
                const real = (txs || []).filter((t: any) => !INTERNAL_CATEGORIES.includes(t.category));

                const monthByCategory: Record<string, number> = {};
                const last7ByCategory: Record<string, number> = {};
                let monthExpense = 0, last7Total = 0, prev7Total = 0;
                for (const t of real) {
                    const amount = parseFloat(t.amount);
                    if (t.date >= monthStart) {
                        monthExpense += amount;
                        monthByCategory[t.category] = (monthByCategory[t.category] || 0) + amount;
                    }
                    if (t.date >= last7Start) {
                        last7Total += amount;
                        last7ByCategory[t.category] = (last7ByCategory[t.category] || 0) + amount;
                    } else if (t.date >= prev7Start && t.date <= prev7End) {
                        prev7Total += amount;
                    }
                }

                const { data: profile } = await admin.from('profiles').select('monthly_budget').eq('id', userId).maybeSingle();
                // Si category_budgets aun no existe, simplemente no hay limites por categoria
                const { data: cats } = await admin.from('category_budgets').select('category, monthly_amount').eq('user_id', userId);
                const { data: logged } = await admin.from('push_alert_log').select('alert_key').eq('user_id', userId);

                const alerts = computeDailyAlerts({
                    todayISO, weekday,
                    monthlyBudget: parseFloat(profile?.monthly_budget || 0),
                    monthExpense, monthByCategory,
                    catLimits: (cats || []).map((c: any) => ({ category: c.category, limit: parseFloat(c.monthly_amount) })),
                    last7: { total: last7Total, byCategory: last7ByCategory },
                    prev7Total,
                    sentKeys: new Set((logged || []).map((l: any) => l.alert_key))
                });

                for (const alert of alerts) {
                    const results = await Promise.all(subs.map(s =>
                        sendTo(s, { title: alert.title, body: alert.body, tag: alert.tag, url: './' })));
                    // Se registra como enviado solo si llego a algun dispositivo
                    // (si todos fallaron, se reintenta manana).
                    if (results.includes('ok')) {
                        await admin.from('push_alert_log').upsert({ user_id: userId, alert_key: alert.key });
                        summary.alertsSent++;
                    }
                }
            } catch (e) {
                console.error('daily push error for user', userId, e);
                summary.errors++;
            }
        }
        return json(summary);
    }

    return json({ error: 'mode debe ser "test" o "daily"' }, 400);
}

if ((globalThis as any).Deno && (globalThis as any).Deno.serve) {
    (globalThis as any).Deno.serve(handler);
}
