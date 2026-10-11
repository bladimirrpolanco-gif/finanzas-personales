/* ===================================
   Finia - Informe
   ===================================
   Panel con lo que mas pesa en tus finanzas: categorias con mas gasto, gastos e
   ingresos que mas se repiten y en que gastas mas dinero.

   "Tiempo real": se recalcula al abrirlo, al guardar/editar/borrar un movimiento
   (refreshAfterTxChange vuelve a pintar la pagina), al volver a la app desde
   otra y cada 20 s mientras esta abierto y visible (por si registraste algo
   desde otro celular). Los movimientos internos (transferencias y depositos a
   bolsillos) nunca cuentan: no son gasto ni ingreso real. */

const FinanzReport = (() => {
    const TOP = 5;

    // "Cafe  Starbucks" y "cafe starbucks" son el mismo movimiento
    function normalizeTitle(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
    }

    function toAmount(tx) {
        const n = parseFloat(tx.amount);
        return isFinite(n) ? n : 0;
    }

    // Agrupa por titulo normalizado. Se muestra el nombre tal como el usuario lo
    // escribio mas veces (si empatan, el mas reciente). Sin titulo -> categoria.
    function groupByTitle(txs, type) {
        const groups = new Map();
        txs.forEach(tx => {
            const raw = String(tx.title || '').trim();
            const label = raw || FinanzUtils.getCategoryInfo(type, tx.category).name;
            const key = normalizeTitle(label);
            if (!key) return;
            let g = groups.get(key);
            if (!g) {
                g = { key, count: 0, total: 0, names: new Map(), lastDate: '' };
                groups.set(key, g);
            }
            g.count += 1;
            g.total += toAmount(tx);
            g.names.set(label, (g.names.get(label) || 0) + 1);
            if ((tx.date || '') > g.lastDate) g.lastDate = tx.date || '';
        });

        return [...groups.values()].map(g => {
            let name = '';
            let best = -1;
            g.names.forEach((n, label) => {
                if (n > best) { best = n; name = label; }
            });
            return { key: g.key, name, count: g.count, total: g.total, average: g.total / g.count, lastDate: g.lastDate };
        });
    }

    // Mas veces primero; si empatan, el que mas dinero suma
    const byFrequency = (a, b) => b.count - a.count || b.total - a.total || a.name.localeCompare(b.name, 'es');
    const byTotal = (a, b) => b.total - a.total || b.count - a.count || a.name.localeCompare(b.name, 'es');

    const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

    // Barras de ingresos vs gastos a lo largo del tiempo: por dia (hasta 31 dias),
    // por semana (3 meses) o por mes (el ano). Se rellenan los huecos sin
    // movimientos para que la linea de tiempo sea continua.
    function buildTimeline(txs, period) {
        const range = getRange(period);
        const start = FinanzUtils.parseLocalDate(range.startISO);
        const end = FinanzUtils.parseLocalDate(range.endISO);
        const granularity = period === 'year' ? 'month' : (period === '90days' ? 'week' : 'day');

        const mondayOf = d => {
            const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
            m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
            return m;
        };
        const keyOf = d => {
            if (granularity === 'month') return `${d.getFullYear()}-${d.getMonth()}`;
            if (granularity === 'week') return FinanzUtils.toLocalISODate(mondayOf(d));
            return FinanzUtils.toLocalISODate(d);
        };
        const labelOf = d => {
            if (granularity === 'month') return MONTHS[d.getMonth()];
            const base = granularity === 'week' ? mondayOf(d) : d;
            return `${base.getDate()} ${MONTHS[base.getMonth()]}`;
        };

        const buckets = new Map();
        let cursor = granularity === 'week' ? mondayOf(start)
            : (granularity === 'month' ? new Date(start.getFullYear(), start.getMonth(), 1) : new Date(start));
        while (cursor <= end) {
            buckets.set(keyOf(cursor), { label: labelOf(cursor), income: 0, expense: 0 });
            if (granularity === 'month') cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
            else cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + (granularity === 'week' ? 7 : 1));
        }

        txs.forEach(t => {
            if (!t.date) return;
            const bucket = buckets.get(keyOf(FinanzUtils.parseLocalDate(t.date)));
            if (!bucket) return;
            if (t.type === 'income') bucket.income += toAmount(t);
            else if (t.type === 'expense') bucket.expense += toAmount(t);
        });

        const list = [...buckets.values()];
        return {
            granularity,
            labels: list.map(b => b.label),
            income: list.map(b => b.income),
            expense: list.map(b => b.expense)
        };
    }

    // Funcion pura (sin pantalla ni red): recibe los movimientos del periodo y
    // devuelve todo lo que el panel muestra.
    function build(txs, period = 'thisMonth', prevTxs = null) {
        const real = (txs || []).filter(t => !FinanzUtils.isInternalMovement(t));
        const hasPrev = Array.isArray(prevTxs);
        const prevReal = hasPrev ? prevTxs.filter(t => !FinanzUtils.isInternalMovement(t)) : [];
        const prevExpenses = prevReal.filter(t => t.type === 'expense');
        const prevByCategory = new Map();
        prevExpenses.forEach(t => {
            const id = t.category || 'other';
            prevByCategory.set(id, (prevByCategory.get(id) || 0) + toAmount(t));
        });
        const expenses = real.filter(t => t.type === 'expense');
        const incomes = real.filter(t => t.type === 'income');

        const sum = list => list.reduce((s, t) => s + toAmount(t), 0);
        const expenseTotal = sum(expenses);
        const incomeTotal = sum(incomes);

        // Categorias con mas gasto
        const byCategory = new Map();
        expenses.forEach(t => {
            const id = t.category || 'other';
            const c = byCategory.get(id) || { id, amount: 0, count: 0 };
            c.amount += toAmount(t);
            c.count += 1;
            byCategory.set(id, c);
        });
        const allCategories = [...byCategory.values()].sort((a, b) => b.amount - a.amount || b.count - a.count);
        // Para la dona: las 5 principales y, si hay mas, el resto junto (suma el 100%)
        const restAmount = allCategories.slice(TOP).reduce((s, c) => s + c.amount, 0);
        const categoryChart = {
            labels: allCategories.slice(0, TOP).map(c => FinanzUtils.getCategoryInfo('expense', c.id).name),
            data: allCategories.slice(0, TOP).map(c => c.amount)
        };
        if (restAmount > 0) {
            categoryChart.labels.push('Otras categorías');
            categoryChart.data.push(restAmount);
        }

        const categories = allCategories
            .map(c => {
                const info = FinanzUtils.getCategoryInfo('expense', c.id);
                const prevAmount = prevByCategory.get(c.id) || 0;
                return {
                    id: c.id,
                    name: info.name,
                    icon: info.icon,
                    amount: c.amount,
                    count: c.count,
                    percentage: expenseTotal > 0 ? (c.amount / expenseTotal) * 100 : 0,
                    previousAmount: prevAmount,
                    changePct: hasPrev ? pctChange(c.amount, prevAmount) : null
                };
            })
            .slice(0, TOP);

        const expenseGroups = groupByTitle(expenses, 'expense');
        const incomeGroups = groupByTitle(incomes, 'income');

        const prevExpenseTotal = sum(prevExpenses);
        const prevIncomeTotal = sum(prevReal.filter(t => t.type === 'income'));

        return {
            expenseTotal,
            incomeTotal,
            comparison: hasPrev ? {
                expenseTotal: prevExpenseTotal,
                incomeTotal: prevIncomeTotal,
                expenseChangePct: pctChange(expenseTotal, prevExpenseTotal),
                incomeChangePct: pctChange(incomeTotal, prevIncomeTotal)
            } : null,
            balance: incomeTotal - expenseTotal,
            count: real.length,
            expenseCount: expenses.length,
            incomeCount: incomes.length,
            categories,
            categoryChart,
            timeline: buildTimeline(real, period),
            // Solo cuenta como "recurrente" lo que aparece 2 veces o mas
            frequentExpenses: expenseGroups.filter(g => g.count >= 2).sort(byFrequency).slice(0, TOP),
            frequentIncomes: incomeGroups.filter(g => g.count >= 2).sort(byFrequency).slice(0, TOP),
            // En que se va mas dinero (aunque sea una sola vez)
            topSpending: expenseGroups.slice().sort(byTotal).slice(0, TOP)
        };
    }

    // Rango del periodo en fechas locales (nunca toISOString: corre el dia por la zona horaria)
    function getRange(period) {
        const now = new Date();
        let start;
        if (period === 'thisMonth') {
            start = new Date(now.getFullYear(), now.getMonth(), 1);
        } else if (period === 'year') {
            start = new Date(now.getFullYear(), 0, 1);
        } else {
            start = new Date(now);
            start.setDate(start.getDate() - (period === '90days' ? 90 : 30));
        }
        return { startISO: FinanzUtils.toLocalISODate(start), endISO: FinanzUtils.toLocalISODate(now) };
    }

    // Periodo anterior de la MISMA duracion ("justo"): si hoy es 10 de octubre,
    // este mes (1-10 oct) se compara con 1-10 sep, no con septiembre completo
    // (daria una bajada falsa). 30/90 dias: los N dias justo antes. Ano: lo
    // mismo del ano pasado hasta esta misma fecha.
    function getPreviousRange(period) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        let start, end;
        if (period === 'thisMonth') {
            const lastDayPrev = new Date(today.getFullYear(), today.getMonth(), 0).getDate();
            start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            end = new Date(today.getFullYear(), today.getMonth() - 1, Math.min(today.getDate(), lastDayPrev));
        } else if (period === 'year') {
            const lastDayPrev = new Date(today.getFullYear() - 1, today.getMonth() + 1, 0).getDate();
            start = new Date(today.getFullYear() - 1, 0, 1);
            end = new Date(today.getFullYear() - 1, today.getMonth(), Math.min(today.getDate(), lastDayPrev));
        } else {
            const n = period === '90days' ? 90 : 30;
            end = new Date(today.getFullYear(), today.getMonth(), today.getDate() - n - 1);
            start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - n);
        }
        return { startISO: FinanzUtils.toLocalISODate(start), endISO: FinanzUtils.toLocalISODate(end) };
    }

    // Variacion en %; null si antes no habia nada con que comparar
    function pctChange(current, previous) {
        return previous > 0 ? ((current - previous) / previous) * 100 : null;
    }

    function rangeLabel(range) {
        const fmt = iso => {
            const d = FinanzUtils.parseLocalDate(iso);
            return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
        };
        return `${fmt(range.startISO)} – ${fmt(range.endISO)}`;
    }

    return { build, getRange, getPreviousRange, rangeLabel, normalizeTitle };
})();

// ===== PANTALLA =====
let currentReportPeriod = 'thisMonth';
let reportRenderSeq = 0;
let reportTimer = null;

function reportMoney(n) {
    return FinanzUtils.formatCurrency(n);
}

function reportEmpty(text) {
    return `<div class="report-empty">${escapeHTML(text)}</div>`;
}

// Colores de las categorias: los mismos en la dona y en las filas
const REPORT_COLORS = ['#CAFD0A', '#38BDF8', '#F472B6', '#FBBF24', '#A78BFA', '#94A3B8'];
const REPORT_RED = '#FF6B6B';
const REPORT_GREEN = '#3DDC84';

// Fila con barra: sirve para categorias, gastos repetidos, etc.
function reportRow({ rank, icon, title, meta, value, valueClass = '', percent = null, color = null }) {
    const bar = percent === null ? '' : `
        <div class="report-bar"><div class="report-bar-fill" style="width: ${Math.max(2, Math.min(100, percent)).toFixed(1)}%"></div></div>`;
    const tint = color ? ` style="--row-color: ${color}"` : '';
    return `
        <div class="report-row"${tint}>
            <div class="report-rank">${rank}</div>
            ${icon ? `<div class="report-icon"><i class="fas ${escapeHTML(icon)}"></i></div>` : ''}
            <div class="report-main">
                <div class="report-line">
                    <div class="report-title">${escapeHTML(title)}</div>
                    <div class="report-value ${valueClass}">${value}</div>
                </div>
                <div class="report-meta">${meta}</div>
                ${bar}
            </div>
        </div>`;
}

// Variacion contra el periodo anterior. En gastos subir es malo (rojo) y bajar
// es bueno (verde); en ingresos al reves.
function reportDelta(pct, { higherIsBad, isNew = false }) {
    if (pct === null) return isNew ? '<span class="report-delta neutral">Nuevo</span>' : '';
    if (Math.abs(pct) < 1) return '<span class="report-delta neutral">= igual</span>';
    const up = pct > 0;
    const good = up !== higherIsBad;
    const text = Math.abs(pct) >= 1000 ? '+999%' : `${Math.abs(pct).toFixed(0)}%`;
    return `<span class="report-delta ${good ? 'good' : 'bad'}"><i class="fas fa-caret-${up ? 'up' : 'down'}"></i> ${text}</span>`;
}

function reportTimes(n) {
    return n === 1 ? '1 vez' : `${n} veces`;
}

const REPORT_TOOLTIP = {
    backgroundColor: '#1A1A1A',
    titleColor: '#FFFFFF',
    bodyColor: '#FFFFFF',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    padding: 12
};

function resetChart(canvas) {
    const existing = Chart.getChart(canvas);
    if (existing) existing.destroy();
}

// Configuracion de las dos graficas. Se usa en pantalla (fondo oscuro) y para el
// PDF (fondo blanco, `print: true`): mismo diseno, solo cambian los colores.
function donutChartConfig(report, { print = false } = {}) {
    return {
        type: 'doughnut',
        data: {
            labels: report.categoryChart.labels,
            datasets: [{
                data: report.categoryChart.data,
                backgroundColor: report.categoryChart.labels.map((_, i) => REPORT_COLORS[i % REPORT_COLORS.length]),
                borderColor: print ? '#FFFFFF' : 'rgba(8, 14, 11, 0.9)',
                borderWidth: 3,
                hoverOffset: print ? 0 : 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '68%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    ...REPORT_TOOLTIP,
                    callbacks: {
                        label: ctx => {
                            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                            const pct = total > 0 ? Math.round((ctx.raw / total) * 100) : 0;
                            return `${ctx.label}: ${FinanzUtils.formatCurrency(ctx.raw)} (${pct}%)`;
                        }
                    }
                }
            }
        }
    };
}

function barChartConfig(report, { print = false } = {}) {
    const text = print ? '#444444' : '#93A59B';
    return {
        type: 'bar',
        data: {
            labels: report.timeline.labels,
            datasets: [
                { label: 'Ingresos', data: report.timeline.income, backgroundColor: REPORT_GREEN, borderRadius: 4, maxBarThickness: 18 },
                { label: 'Gastos', data: report.timeline.expense, backgroundColor: REPORT_RED, borderRadius: 4, maxBarThickness: 18 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    position: 'top',
                    align: 'end',
                    labels: { color: print ? '#222222' : '#BBC7C1', boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'rectRounded' }
                },
                tooltip: {
                    ...REPORT_TOOLTIP,
                    callbacks: { label: ctx => `${ctx.dataset.label}: ${FinanzUtils.formatCurrency(ctx.raw)}` }
                }
            },
            scales: {
                x: { grid: { display: false }, ticks: { maxTicksLimit: 7, color: text, maxRotation: 0 } },
                y: {
                    beginAtZero: true,
                    position: 'right',
                    grid: { color: print ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.06)' },
                    ticks: { maxTicksLimit: 5, color: text, callback: v => FinanzUtils.formatCompact(v) }
                }
            }
        }
    };
}

let lastReport = null;

// Dona de categorias + barras de ingresos vs gastos
function paintReportCharts(report) {
    lastReport = report;
    const donutBox = document.getElementById('report-donut-box');
    const donutCanvas = document.getElementById('report-category-chart');
    const barCanvas = document.getElementById('report-timeline-chart');
    const barEmpty = document.getElementById('report-timeline-empty');

    if (donutCanvas) resetChart(donutCanvas);
    if (barCanvas) resetChart(barCanvas);

    const hasCategories = report.categoryChart.data.length > 0;
    if (donutBox) donutBox.style.display = hasCategories ? '' : 'none';

    const hasTimeline = report.timeline.income.some(v => v > 0) || report.timeline.expense.some(v => v > 0);
    if (barCanvas) barCanvas.parentElement.style.display = hasTimeline ? '' : 'none';
    if (barEmpty) barEmpty.style.display = hasTimeline ? 'none' : '';

    if (typeof Chart === 'undefined') return; // sin la libreria de graficas quedan las barras de las listas

    if (donutCanvas && hasCategories) new Chart(donutCanvas, donutChartConfig(report));
    if (barCanvas && hasTimeline) new Chart(barCanvas, barChartConfig(report));
}

function paintReport(report, prevRange = null) {
    const setHTML = (id, html) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
    };
    const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    setText('report-donut-total', reportMoney(report.expenseTotal));
    setText('report-expense', reportMoney(report.expenseTotal));
    setText('report-income', reportMoney(report.incomeTotal));
    const balanceEl = document.getElementById('report-balance');
    if (balanceEl) {
        balanceEl.textContent = reportMoney(report.balance);
        balanceEl.classList.toggle('negative', report.balance < 0);
        balanceEl.classList.toggle('positive', report.balance > 0);
    }
    const countText = `${report.count} ${report.count === 1 ? 'movimiento' : 'movimientos'}`;
    const cmp = report.comparison;
    const expDelta = document.getElementById('report-expense-delta');
    const incDelta = document.getElementById('report-income-delta');
    if (expDelta) {
        expDelta.innerHTML = cmp ? (reportDelta(cmp.expenseChangePct, { higherIsBad: true, isNew: report.expenseTotal > 0 }) || '&nbsp;') : '&nbsp;';
    }
    if (incDelta) {
        incDelta.innerHTML = cmp ? (reportDelta(cmp.incomeChangePct, { higherIsBad: false, isNew: report.incomeTotal > 0 }) || '&nbsp;') : '&nbsp;';
    }
    setText('report-count', cmp && prevRange
        ? `${countText} · comparado con ${FinanzReport.rangeLabel(prevRange)}`
        : countText);

    // 1. Categorias con mas gastos
    const topCat = report.categories[0];
    setHTML('report-categories', report.categories.length === 0
        ? reportEmpty('Aún no hay gastos en este período.')
        : report.categories.map((c, i) => reportRow({
            rank: i + 1,
            icon: c.icon,
            title: c.name,
            meta: `${c.percentage.toFixed(0)}% de tus gastos · ${reportTimes(c.count)}${report.comparison ? ' ' + reportDelta(c.changePct, { higherIsBad: true, isNew: true }) : ''}`,
            value: reportMoney(c.amount),
            percent: topCat.amount > 0 ? (c.amount / topCat.amount) * 100 : 0,
            color: REPORT_COLORS[i % REPORT_COLORS.length]
        })).join(''));

    // 2. Gastos que mas se repiten
    const topFreqExp = report.frequentExpenses[0];
    setHTML('report-frequent-expenses', report.frequentExpenses.length === 0
        ? reportEmpty('Todavía no hay gastos que se repitan en este período.')
        : report.frequentExpenses.map((g, i) => reportRow({
            rank: i + 1,
            title: g.name,
            meta: `${reportTimes(g.count)} · promedio ${reportMoney(g.average)}`,
            value: reportMoney(g.total),
            valueClass: 'text-danger',
            percent: (g.count / topFreqExp.count) * 100,
            color: REPORT_RED
        })).join(''));

    // 3. Ingresos que mas se repiten
    const topFreqInc = report.frequentIncomes[0];
    setHTML('report-frequent-incomes', report.frequentIncomes.length === 0
        ? reportEmpty('Todavía no hay ingresos que se repitan en este período.')
        : report.frequentIncomes.map((g, i) => reportRow({
            rank: i + 1,
            title: g.name,
            meta: `${reportTimes(g.count)} · promedio ${reportMoney(g.average)}`,
            value: reportMoney(g.total),
            valueClass: 'text-success',
            percent: (g.count / topFreqInc.count) * 100,
            color: REPORT_GREEN
        })).join(''));

    // 4. En que gastas mas dinero
    const topSpend = report.topSpending[0];
    setHTML('report-top-spending', report.topSpending.length === 0
        ? reportEmpty('Aún no hay gastos en este período.')
        : report.topSpending.map((g, i) => reportRow({
            rank: i + 1,
            title: g.name,
            meta: `${reportTimes(g.count)}${report.expenseTotal > 0 ? ` · ${((g.total / report.expenseTotal) * 100).toFixed(0)}% de tus gastos` : ''}`,
            value: reportMoney(g.total),
            valueClass: 'text-danger',
            percent: topSpend.total > 0 ? (g.total / topSpend.total) * 100 : 0,
            color: REPORT_RED
        })).join(''));

    paintReportCharts(report);

    const live = document.getElementById('report-updated');
    if (live) {
        live.textContent = `Actualizado ${new Date().toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}`;
    }
}

async function renderReport() {
    const seq = ++reportRenderSeq;
    const range = FinanzReport.getRange(currentReportPeriod);
    const prevRange = FinanzReport.getPreviousRange(currentReportPeriod);
    let txs = [];
    let prevTxs = null; // null = no se pudo traer: el informe se muestra sin comparacion
    try {
        [txs, prevTxs] = await Promise.all([
            FinanzData.getTransactionsInRange(range.startISO, range.endISO),
            FinanzData.getTransactionsInRange(prevRange.startISO, prevRange.endISO)
        ]);
    } catch (err) {
        console.error('Report Error:', err);
        txs = [];
        prevTxs = null;
    }
    if (seq !== reportRenderSeq) return; // llego una consulta mas nueva: esta ya no sirve
    paintReport(FinanzReport.build(txs, currentReportPeriod, prevTxs), prevTxs ? prevRange : null);
}

async function setReportPeriod(period) {
    currentReportPeriod = period;
    document.querySelectorAll('#page-report .report-period-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.period === period);
    });
    await renderReport();
}

// ===== EXPORTAR A PDF =====
// Se usa el dialogo de impresion del sistema (en el celular: "Compartir/Imprimir"
// -> guardar como PDF): sin librerias, texto nitido y las graficas incluidas.
// La hoja de estilo de impresion (@media print en ui.css) deja solo el informe
// sobre fondo blanco; aqui se recolorean las graficas, que estan pensadas para
// fondo oscuro, y se rellena el encabezado con el periodo.
const REPORT_PERIOD_NAMES = { thisMonth: 'Este mes', '30days': 'Últimos 30 días', '90days': 'Últimos 3 meses', year: 'Este año' };
let reportPrintRestoreTimer = null;

// Dibuja una grafica FUERA de pantalla con colores de papel y devuelve su imagen.
// Asi el PDF no depende de como cada navegador imprima un <canvas> (en el celular
// salia en blanco). Resolucion x2 para que se vea nitida.
function reportChartImage(config, width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width * 2;
    canvas.height = height * 2;
    const chart = new Chart(canvas, {
        ...config,
        options: { ...config.options, responsive: false, animation: false, devicePixelRatio: 1 }
    });
    const url = canvas.toDataURL('image/png');
    chart.destroy();
    return url;
}

function addReportPrintImage(container, url, className) {
    const img = document.createElement('img');
    img.className = `report-print-img ${className}`;
    img.alt = '';
    img.src = url;
    container.appendChild(img);
}

function removeReportPrintImages() {
    document.querySelectorAll('#page-report .report-print-img').forEach(img => img.remove());
}

function restoreReportAfterPrint() {
    clearTimeout(reportPrintRestoreTimer);
    removeReportPrintImages();
}

function exportReportPDF() {
    const range = FinanzReport.getRange(currentReportPeriod);
    const header = document.getElementById('report-print-header');
    if (header) {
        const generated = new Date().toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' });
        header.innerHTML = `<h2>Informe financiero · Finia</h2>
            <p>${escapeHTML(REPORT_PERIOD_NAMES[currentReportPeriod] || '')} (${escapeHTML(FinanzReport.rangeLabel(range))}) · Generado el ${escapeHTML(generated)}</p>`;
    }

    removeReportPrintImages();
    if (lastReport && typeof Chart !== 'undefined') {
        try {
            const barCanvas = document.getElementById('report-timeline-chart');
            const donutBox = document.getElementById('report-donut-box');
            if (barCanvas && barCanvas.parentElement.style.display !== 'none') {
                addReportPrintImage(barCanvas.parentElement,
                    reportChartImage(barChartConfig(lastReport, { print: true }), 512, 230), 'report-print-bar');
            }
            if (donutBox && donutBox.style.display !== 'none') {
                addReportPrintImage(donutBox,
                    reportChartImage(donutChartConfig(lastReport, { print: true }), 160, 160), 'report-print-donut');
            }
        } catch (err) {
            console.error('Report print charts error:', err);
        }
    }

    // Si el navegador no avisa al terminar de imprimir, se limpia solo tras un rato
    reportPrintRestoreTimer = setTimeout(restoreReportAfterPrint, 120000);
    // Un instante para que las imagenes queden en la pagina antes de abrir la impresion
    setTimeout(() => window.print(), 150);
}

window.addEventListener('afterprint', restoreReportAfterPrint);

// Refresco automatico mientras el informe esta abierto y a la vista
function startReportAutoRefresh() {
    if (reportTimer) return;
    reportTimer = setInterval(() => {
        if (currentPage !== 'report' || document.hidden) return;
        renderReport();
    }, 20000);
}

document.addEventListener('visibilitychange', () => {
    if (!document.hidden && currentPage === 'report') renderReport();
});
startReportAutoRefresh();

window.FinanzReport = FinanzReport;
window.renderReport = renderReport;
window.setReportPeriod = setReportPeriod;
window.exportReportPDF = exportReportPDF;
