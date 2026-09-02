/**
 * Finia - Main App (Supabase Version)
 * All buttons and forms wired to Supabase
 */

let currentPage = 'dashboard';
let currentFilter = '30days';
let currentTransactionType = 'all';
let currentAnalysisType = 'expense';
let currentCategoryType = 'expense';
let authListenerReady = false;
let currentCalendarMonth = new Date();
currentCalendarMonth.setDate(1);

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    setupAuthUi();
    const isLoggedIn = await FinanzData.init();
    setupAuthStateListener();

    if (isLoggedIn) {
        hideAuthOverlay();
        updateUserProfileUI();
        await navigateTo('dashboard');
    } else {
        showAuthOverlay();
        const emailInput = document.getElementById('auth-email');
        const passInput = document.getElementById('auth-password');
        if (emailInput) emailInput.value = '';
        if (passInput) passInput.value = '';
    }

    setupNavigation();
    // setupModals(); // Eliminado para evitar ReferenceError
    handleUrlParams();
    setupDesktopSidebar();
    if (isLoggedIn) checkBudgetAlerts();
}

function setupAuthStateListener() {
    if (authListenerReady) return;
    authListenerReady = true;

    window.supabaseClient.auth.onAuthStateChange(async (_event, session) => {
        FinanzData.user = session?.user || null;

        if (session?.user) {
            const allowed = await FinanzData.init();
            if (!allowed) {
                showAuthOverlay();
                showAuthError(FinanzData.lastAccessError || 'Tu cuenta no está autorizada para usar esta app.');
                return;
            }

            hideAuthOverlay();
            updateUserProfileUI();
            await navigateTo('dashboard');
            checkBudgetAlerts();
            return;
        }

        showAuthOverlay();
    });
}

function showAuthOverlay() {
    const overlay = document.getElementById('auth-overlay');
    if (overlay) overlay.classList.add('active');
}

function hideAuthOverlay() {
    const overlay = document.getElementById('auth-overlay');
    if (overlay) overlay.classList.remove('active');
}

function toggleAuthPassword() {
    const input = document.getElementById('auth-password');
    const icon = document.getElementById('auth-password-toggle-icon');
    if (!input || !icon) return;

    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    icon.classList.toggle('fa-eye', !isHidden);
    icon.classList.toggle('fa-eye-slash', isHidden);
}

// ===== TEMA DEL LOGIN (claro/oscuro, a gusto de quien entra) =====
const AUTH_THEME_KEY = 'finia-auth-theme';

function applyAuthTheme(theme) {
    const overlay = document.getElementById('auth-overlay');
    const icon = document.getElementById('auth-theme-icon');
    if (!overlay) return;

    if (theme === 'light') {
        overlay.setAttribute('data-theme', 'light');
        if (icon) {
            icon.classList.remove('fa-sun');
            icon.classList.add('fa-moon');
        }
    } else {
        overlay.removeAttribute('data-theme');
        if (icon) {
            icon.classList.remove('fa-moon');
            icon.classList.add('fa-sun');
        }
    }
}

function toggleAuthTheme() {
    const overlay = document.getElementById('auth-overlay');
    const current = overlay && overlay.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    const next = current === 'light' ? 'dark' : 'light';
    applyAuthTheme(next);
    try {
        localStorage.setItem(AUTH_THEME_KEY, next);
    } catch (e) {}
}

function showAuthError(message) {
    const errorEl = document.getElementById('auth-error');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
    }
}

function setupAuthUi() {
    try {
        const savedTheme = localStorage.getItem(AUTH_THEME_KEY);
        if (savedTheme === 'light') applyAuthTheme('light');
    } catch (e) {}

    const btn = document.getElementById('auth-submit');
    if (btn) {
        btn.innerHTML = 'Entrar <i class="fas fa-arrow-right"></i>';
    }

    const info = document.querySelector('#auth-overlay .auth-privacy-text p');
    if (info) {
        info.textContent = 'Solo usuarios autorizados por el administrador.';
    }
}

function setupDesktopSidebar() {
    const nameEl = document.getElementById('ds-user-name');
    const emailEl = document.getElementById('ds-user-email');
    if (nameEl && FinanzData.user) {
        const email = FinanzData.user.email || '';
        nameEl.textContent = email.split('@')[0] || 'Usuario';
        emailEl.textContent = email;
    }
    updateDesktopSidebarActive();
}

function updateDesktopSidebarActive() {
    document.querySelectorAll('#desktop-sidebar .ds-item').forEach(item => {
        item.classList.remove('ds-active');
    });
    const items = document.querySelectorAll('#desktop-sidebar .ds-item');
    items.forEach(item => {
        const onclick = item.getAttribute('onclick') || '';
        if (onclick.includes(`'${currentPage}'`)) {
            item.classList.add('ds-active');
        }
    });
}
// ===== AUTENTICACIÃ“N =====
async function handleAuth(e) {
    if (e) e.preventDefault();
    if (window.isLoggingOut) return; // Prevenir auto-submit de gestores de contraseÃ±as

    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const btn = document.getElementById('auth-submit');
    const errorEl = document.getElementById('auth-error');

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Conectando...';
    }

    if (errorEl) errorEl.style.display = 'none';

    try {
        const { data, error } = await window.supabaseClient.auth.signInWithPassword({ email, password });

        if (error) {
            // Manejar especÃ­ficamente el lÃ­mite de velocidad
            if (error.status === 429) {
                throw new Error('LÃ­mite de intentos excedido. Por favor, espera unos minutos antes de intentar de nuevo.');
            }

            if (error.status === 400 && (error.message.includes('Invalid login credentials') || error.message.includes('User not found'))) {
                throw new Error('Usuario no autorizado o credenciales incorrectas.');
            }

            throw error;
        }

        if (data?.user) {
            const allowed = await FinanzData.init();
            if (!allowed) {
                await window.supabaseClient.auth.signOut();
                showAuthOverlay();
                showAuthError(FinanzData.lastAccessError || 'Tu cuenta no está autorizada para usar esta app.');
                return;
            }

            hideAuthOverlay();
            showToast('Â¡Bienvenido!');
            updateUserProfileUI();
            await navigateTo('dashboard');
        }
    } catch (err) {
        console.error('Auth Error:', err);
        if (errorEl) {
            errorEl.textContent = err.message;
            errorEl.style.display = 'block';
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Entrar';
        }
    }
}

// ===== NAVEGACIÃ“N =====
function setupNavigation() {
    document.querySelectorAll('.nav-item[data-page]').forEach(n => {
        n.onclick = async () => await navigateTo(n.dataset.page);
    });

    // Cerrar el menu del selector de periodo del dashboard al tocar afuera
    document.addEventListener('click', (e) => {
        const wrap = document.querySelector('.dash-period-wrap');
        const menu = document.getElementById('dash-period-menu');
        if (wrap && menu && !wrap.contains(e.target)) {
            menu.classList.remove('open');
        }
    });
}

async function navigateTo(page) {
    currentPage = page;

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    const target = document.getElementById(`page-${page}`);
    if (target) {
        target.classList.add('active');
        const nav = document.querySelector(`.nav-item[data-page="${page}"]`);
        if (nav) nav.classList.add('active');
    }

    // Refresh data for the specific page
    switch (page) {
        case 'dashboard': await renderDashboard(); break;
        case 'transactions': await renderTransactions(); break;
        case 'analysis': await renderAnalysis(); break;
        case 'profile': await renderProfile(); break;
    }
}

// ===== DASHBOARD: PERIODO, VARIACIONES E INSIGHT =====
let currentDashboardPeriod = 'thisMonth';

function toggleDashPeriodMenu() {
    const menu = document.getElementById('dash-period-menu');
    if (menu) menu.classList.toggle('open');
}

async function setDashboardPeriod(period) {
    currentDashboardPeriod = period;

    const labels = {
        thisMonth: 'Este mes',
        week: 'Esta semana',
        '30days': 'Últimos 30 días',
        today: 'Hoy'
    };
    const labelEl = document.getElementById('dash-period-label');
    if (labelEl) labelEl.textContent = labels[period] || 'Este mes';

    document.querySelectorAll('#dash-period-menu button').forEach(btn => {
        btn.classList.toggle('active', (btn.getAttribute('onclick') || '').includes(`'${period}'`));
    });

    const menu = document.getElementById('dash-period-menu');
    if (menu) menu.classList.remove('open');

    await renderDashboard();
}

function renderPatrimonyChange(comparison) {
    const changeEl = document.getElementById('patrimony-change');
    const changeIcon = document.getElementById('patrimony-change-icon');
    const changePct = document.getElementById('patrimony-change-pct');
    const changeSuffix = document.getElementById('patrimony-change-suffix');
    const trendPill = document.getElementById('patrimony-trend-pill');
    const trendText = document.getElementById('patrimony-trend-text');
    if (!changeEl) return;

    const pct = comparison?.patrimonyChangePct;

    if (pct === null || pct === undefined || !isFinite(pct)) {
        changeEl.classList.remove('positive', 'negative');
        if (changeIcon) changeIcon.className = 'fas fa-minus';
        if (changePct) changePct.textContent = 'Sin datos';
        if (changeSuffix) changeSuffix.textContent = 'del período anterior';
        if (trendPill) {
            trendPill.classList.remove('negative');
            trendPill.classList.add('neutral');
        }
        if (trendText) trendText.textContent = 'Sin histórico';
        return;
    }

    const isPositive = pct >= 0;
    changeEl.classList.toggle('positive', isPositive);
    changeEl.classList.toggle('negative', !isPositive);
    if (changeIcon) changeIcon.className = 'fas ' + (isPositive ? 'fa-arrow-up' : 'fa-arrow-down');
    if (changePct) changePct.textContent = `${isPositive ? '+' : ''}${pct.toFixed(1)}%`;
    if (changeSuffix) changeSuffix.textContent = 'vs. período anterior';

    if (trendPill) {
        trendPill.classList.remove('neutral');
        trendPill.classList.toggle('negative', !isPositive);
    }
    if (trendText) trendText.textContent = isPositive ? 'Tendencia positiva' : 'Tendencia negativa';
}

function renderMonthSummaryChange(elId, pct, isExpense) {
    const el = document.getElementById(elId);
    if (!el) return;

    if (pct === null || pct === undefined || !isFinite(pct)) {
        el.textContent = 'vs. período anterior';
        el.style.color = '';
        return;
    }

    const arrow = pct >= 0 ? '↑' : '↓';
    el.textContent = `${arrow} ${Math.abs(pct).toFixed(0)}% vs. período anterior`;
    // Para ingresos, subir es bueno (verde). Para gastos, subir es malo (rojo).
    const isGood = isExpense ? pct <= 0 : pct >= 0;
    el.style.color = isGood ? 'var(--success)' : 'var(--danger)';
}

function renderAiInsight(comparison) {
    const el = document.getElementById('ai-insight-text');
    if (!el) return;

    const pct = comparison?.expenseChangePct;
    if (pct === null || pct === undefined || !isFinite(pct)) {
        el.textContent = 'Sigue registrando tus movimientos para ver un análisis de tu mes.';
        return;
    }

    const rounded = Math.abs(Math.round(pct));
    if (rounded === 0) {
        el.textContent = 'Tus gastos se mantienen igual que el período pasado.';
    } else if (pct < 0) {
        el.textContent = `Este mes llevas un ${rounded}% menos en gastos que el período pasado. ¡Vas por buen camino!`;
    } else {
        el.textContent = `Este mes llevas un ${rounded}% más en gastos que el período pasado.`;
    }
}

// ===== RENDERING =====
async function renderDashboard() {
    console.log('Rendering Dashboard...');
    const stats = await FinanzData.getDashboardStats(currentDashboardPeriod);
    const comparison = await FinanzData.getPeriodComparison(currentDashboardPeriod);
    console.log('Dashboard Stats:', stats, comparison);

    // 1. Patrimonio y metricas principales
    const elements = {
        'total-balance': stats.totalBalance,
        'available-balance': stats.available,
        'saved-balance': stats.saved,
        'period-income': stats.income,
        'period-expense': stats.expense,
        'remaining-budget': stats.budgetRemaining
    };

    for (const [id, value] of Object.entries(elements)) {
        const el = document.getElementById(id);
        if (el) el.textContent = FinanzUtils.formatCurrency(value);
    }

    // 2. Variacion de patrimonio vs. periodo anterior + pill de tendencia
    renderPatrimonyChange(comparison);

    // 3. Cambios de ingresos/gastos del mes (usa la misma comparacion real)
    renderMonthSummaryChange('dash-income-change', comparison?.incomeChangePct, false);
    renderMonthSummaryChange('dash-expense-change', comparison?.expenseChangePct, true);

    // 4. Insight de Finia AI, basado en la variacion real de gastos
    renderAiInsight(comparison);

    // 5. Grafica de evolucion del patrimonio (datos reales reconstruidos
    // del saldo actual + el ledger de transacciones del periodo)
    const history = await FinanzData.getPatrimonyHistory(currentDashboardPeriod);
    if (history.data.length > 0) {
        FinanzCharts.createPatrimonyChart('patrimony-chart', history);
    }

    // 6. Resumen Financiero Rapido (Promedio Diario / Presupuesto restante)
    const dailyAvgEl = document.getElementById('daily-average');
    const dailyGoalEl = document.getElementById('daily-goal');

    if (dailyAvgEl) {
        // Change logic to Net Daily Balance (Income - Expense) / Days
        const dailyNet = stats.dailyNet || 0;
        dailyAvgEl.textContent = FinanzUtils.formatCurrency(dailyNet, true); // Show sign (+/-)

        // Color logic: Green if positive, Red if negative
        dailyAvgEl.classList.remove('text-success', 'text-danger');
        dailyAvgEl.classList.add(dailyNet >= 0 ? 'text-success' : 'text-danger');

        // Update Label
        // The label is in the header, inside a span with class 'summary-card-label'
        // We find the parent card first to locate the label
        const cardHeader = dailyAvgEl.closest('.summary-card')?.querySelector('.summary-card-label');
        if (cardHeader) cardHeader.textContent = 'Balance Diario Promedio';

        // Update days text
        const dailyMetaEl = dailyAvgEl.parentElement.querySelector('.summary-card-meta');
        if (dailyMetaEl && stats.days) {
            dailyMetaEl.textContent = `${stats.days} dÃ­as transcurridos`;
        }
    }

    if (dailyGoalEl) {
        // Hide "Goal" badge since it doesn't apply to net balance directly
        // Or we could repurpose it to show "Margin %"
        dailyGoalEl.style.display = 'none';
    }

    const budgetRemainingEl = document.getElementById('budget-remaining');
    const budgetPercentEl = document.getElementById('budget-percent');
    // Helper to find label if needed (no ID on label)
    const budgetLabelEl = budgetRemainingEl ? budgetRemainingEl.parentElement.querySelector('.summary-card-label') : null;
    const budgetMetaEl = budgetRemainingEl ? budgetRemainingEl.parentElement.querySelector('.summary-card-meta') : null;

    if (budgetRemainingEl) {
        if (stats.monthlyBudget > 0) {
            // Standard View (Has Budget)
            budgetRemainingEl.textContent = FinanzUtils.formatCurrency(stats.budgetRemaining);

            if (budgetLabelEl) budgetLabelEl.textContent = 'Restante';
            if (budgetMetaEl) budgetMetaEl.textContent = 'Presupuesto';

            if (budgetPercentEl) {
                budgetPercentEl.textContent = `${stats.budgetPercentUsed}% Usado`;
                budgetPercentEl.className = 'summary-card-badge ' + (parseFloat(stats.budgetPercentUsed) > 90 ? 'danger' : 'success');
                budgetPercentEl.onclick = null;
                budgetPercentEl.style.cursor = 'default';
            }
        } else {
            // Smart View (No Budget) -> Show Net Balance
            const balance = stats.income - stats.expense;
            budgetRemainingEl.textContent = FinanzUtils.formatCurrency(balance);

            if (budgetLabelEl) budgetLabelEl.textContent = 'Balance (Ing - Gas)';
            if (budgetMetaEl) budgetMetaEl.textContent = 'Ingresos - Gastos';

            if (budgetPercentEl) {
                budgetPercentEl.textContent = 'Definir Presupuesto';
                budgetPercentEl.className = 'summary-card-badge info';
                budgetPercentEl.style.cursor = 'pointer';
                budgetPercentEl.onclick = () => openModal('modal-budget');
            }
        }
    }

    // Renderizar Bolsillos en Dashboard
    await renderDashboardPockets();
}

async function renderDashboardPockets() {
    const list = document.getElementById('dashboard-pockets-list');
    if (!list) return;

    const pockets = await FinanzData.getPockets();

    if (pockets.length === 0) {
        list.innerHTML = `
            <div class="pocket-card-new" style="min-width: 100%;" onclick="openModal('modal-add-pocket')">
                <i class="fas fa-plus-circle"></i>
                <span>Crear meta</span>
            </div>
        `;
    } else {
        // Añadir tarjeta de "Crear Nuevo" al principio
        let html = `
            <div class="pocket-card-new" onclick="openModal('modal-add-pocket')">
                <i class="fas fa-plus"></i>
                <span>Nuevo</span>
            </div>
        `;

        html += pockets.map(p => {
            const percentage = Math.min(100, (p.current_amount / p.target_amount) * 100).toFixed(0);
            const color = p.color || 'var(--accent-primary)';
            return `
                <div class="pocket-card animate-fade-in" onclick="openPockets()">
                    <button class="pocket-card-deposit-btn" onclick="event.stopPropagation(); openDepositModal('${p.id}', '${p.name}')">
                        <i class="fas fa-plus"></i>
                    </button>

                    <div class="pocket-card-header">
                        <span class="pocket-card-name">${p.name}</span>
                        <i class="fas ${p.icon || 'fa-piggy-bank'}" style="color: ${color};"></i>
                    </div>

                    <div class="pocket-card-amount">${FinanzUtils.formatCurrency(p.current_amount)}</div>
                    <div class="pocket-card-target">de ${FinanzUtils.formatCurrency(p.target_amount)} · ${percentage}%</div>

                    <div class="pocket-card-progress-track">
                        <div class="pocket-card-progress-fill" style="width: ${percentage}%; background-color: ${color};"></div>
                    </div>
                </div>
            `;
        }).join('');

        list.innerHTML = html;
    }
}

async function renderTransactions() {
    const list = document.getElementById('transactions-list');
    if (!list) return;

    const [txs, stats] = await Promise.all([
        FinanzData.getTransactions({ period: currentFilter, type: currentTransactionType }),
        FinanzData.getDashboardStats(currentFilter)
    ]);

    // Actualizar Totales en el Header de transacciones
    const incomeEl = document.getElementById('tx-income-total');
    const expenseEl = document.getElementById('tx-expense-total');
    if (incomeEl) incomeEl.textContent = FinanzUtils.formatCurrency(stats.income);
    if (expenseEl) expenseEl.textContent = FinanzUtils.formatCurrency(stats.expense);

    if (txs.length === 0) {
        list.innerHTML = '<div class="empty-state animate-fade-in"><p>No hay movimientos aÃºn.</p></div>';
        return;
    }

    list.innerHTML = txs.map(t => `
        <div class="transaction-item animate-fade-in" style="display: flex; align-items: center; justify-content: space-between; gap: var(--spacing-md);">
            <div style="display: flex; align-items: center; gap: var(--spacing-md); flex: 1; min-width: 0;">
                <div class="transaction-icon ${t.type === 'income' ? 'bg-success' : 'bg-danger'}">
                    <i class="fas fa-${t.type === 'income' ? 'arrow-up' : 'arrow-down'}"></i>
                </div>
                <div class="transaction-info" style="flex: 1; min-width: 0;">
                    <div class="transaction-title">${t.title}</div>
                    <div class="transaction-category">${t.category}</div>
                </div>
            </div>
            <div style="display: flex; align-items: center; gap: 15px; flex-shrink: 0;">
                <div class="transaction-amount ${t.type === 'income' ? 'text-success' : 'text-danger'}" style="font-weight: 600;">
                    ${t.type === 'income' ? '+' : '-'}${FinanzUtils.formatCurrency(t.amount)}
                </div>
                <button onclick="event.stopPropagation(); handleDeleteTransaction('${t.id}')" style="background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 5px; font-size: 0.95rem; transition: color 0.2s;" onmouseover="this.style.color='#ff4444'" onmouseout="this.style.color='var(--text-muted)'">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        </div>
    `).join('');
}

async function renderAnalysis() {
    const stats = await FinanzData.getDashboardStats(currentFilter);

    const elements = {
        'analysis-balance': stats.totalBalance,
        'analysis-expense': stats.expense,
        'analysis-income': stats.income
    };

    for (const [id, value] of Object.entries(elements)) {
        const el = document.getElementById(id);
        if (el) el.textContent = FinanzUtils.formatCurrency(value);
    }

    const balanceEl = document.getElementById('analysis-balance');
    if (balanceEl) {
        balanceEl.classList.toggle('negative', stats.totalBalance < 0);
        balanceEl.classList.toggle('positive', stats.totalBalance > 0);
    }

    const countEl = document.getElementById('analysis-count');
    if (countEl) countEl.textContent = `${stats.transactionCount} transacciones`;

    // Actualizar GrÃ¡fica
    await refreshAnalysisChart();
}

async function refreshAnalysisChart() {
    if (currentAnalysisType === 'calendar') {
        await renderCalendar();
        return;
    }

    const chartTitle = document.querySelector('.chart-title');
    const periodName = {
        'today': 'Hoy',
        'yesterday': 'Ayer',
        'week': 'Esta Semana',
        '30days': 'Ãšltimos 30 DÃ­as'
    }[currentFilter];

    if (currentAnalysisType === 'budget') {
        if (chartTitle) chartTitle.textContent = `Presupuesto vs Gastos (${periodName})`;
        const stats = await FinanzData.getDashboardStats(currentFilter);
        FinanzCharts.createBudgetChart('expense-chart', {
            budget: stats.monthlyBudget,
            spent: stats.expense
        });
    } else if (currentAnalysisType === 'categories') {
        if (chartTitle) chartTitle.textContent = `DistribuciÃ³n por CategorÃ­as (${periodName})`;
        const chartData = await FinanzData.getCategoryStats('expense', currentFilter);
        FinanzCharts.createCategoryChart('expense-chart', {
            labels: chartData.map(c => c.name),
            data: chartData.map(c => c.amount)
        });
    } else {
        const typeLabel = currentAnalysisType === 'expense' ? 'Gastos' : 'Ingresos';
        if (chartTitle) chartTitle.textContent = `${typeLabel} (${periodName})`;

        const chartData = await FinanzData.getChartData(currentAnalysisType, currentFilter);
        if (currentAnalysisType === 'expense') {
            FinanzCharts.createExpenseChart('expense-chart', chartData);
        } else {
            FinanzCharts.createIncomeChart('expense-chart', chartData);
        }
    }
}

async function setAnalysisType(type) {
    currentAnalysisType = type;

    // Actualizar UI
    document.querySelectorAll('#page-analysis .tab-underline .tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.analysisType === type);
    });

    const chartContainer = document.getElementById('analysis-chart-container');
    const calendarContainer = document.getElementById('analysis-calendar-container');
    if (chartContainer) chartContainer.style.display = type === 'calendar' ? 'none' : 'block';
    if (calendarContainer) calendarContainer.style.display = type === 'calendar' ? 'block' : 'none';

    await renderAnalysis();
}

// ===== CALENDARIO DE MOVIMIENTOS =====
function formatCalendarAmount(amount) {
    const rounded = Math.round(Math.abs(amount));
    const sign = amount < 0 ? '-' : '+';
    return sign + rounded.toLocaleString('es-DO');
}

function changeCalendarMonth(delta) {
    currentCalendarMonth.setMonth(currentCalendarMonth.getMonth() + delta);
    renderCalendar();
}

async function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const label = document.getElementById('calendar-month-label');
    if (!grid) return;

    const year = currentCalendarMonth.getFullYear();
    const month = currentCalendarMonth.getMonth();

    if (label) {
        const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        label.textContent = `${monthNames[month]} ${year}`;
    }

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startWeekday = firstDay.getDay(); // 0 = domingo

    const toISODate = (d) => {
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${d.getFullYear()}-${mm}-${dd}`;
    };

    const txs = await FinanzData.getTransactionsInRange(toISODate(firstDay), toISODate(lastDay));

    // Agrupar por dia (1-31): total de ingresos y de gastos
    const byDay = {};
    txs.forEach(t => {
        const day = parseInt(t.date.slice(8, 10), 10);
        if (!byDay[day]) byDay[day] = { income: 0, expense: 0 };
        const amount = parseFloat(t.amount);
        if (t.type === 'income') byDay[day].income += amount;
        else byDay[day].expense += amount;
    });

    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

    let html = '';
    for (let i = 0; i < startWeekday; i++) {
        html += '<div class="calendar-day empty"></div>';
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const totals = byDay[day];
        const isToday = isCurrentMonth && today.getDate() === day;
        html += `
            <div class="calendar-day${isToday ? ' today' : ''}">
                <span class="calendar-day-num">${day}</span>
                ${totals && totals.income > 0 ? `<span class="calendar-day-income">${formatCalendarAmount(totals.income)}</span>` : ''}
                ${totals && totals.expense > 0 ? `<span class="calendar-day-expense">${formatCalendarAmount(-totals.expense)}</span>` : ''}
            </div>
        `;
    }

    grid.innerHTML = html;
}

async function renderProfile() {
    const settings = await FinanzData.getSettings();
    const budgetInput = document.getElementById('budget-amount');
    if (budgetInput) budgetInput.value = settings.monthlyBudget;
}

// ===== ACTIONS & HANDLERS =====
async function quickAction(type) {
    switch (type) {
        case 'expense': await openAddTransaction('expense'); break;
        case 'income': await openAddTransaction('income'); break;
        case 'transfer': openModal('modal-transfer'); await fillAccountSelects(['tr-from-account', 'tr-to-account']); break;
        case 'categories': await openCategories(); break;
    }
}

async function openAccounts() {
    openModal('modal-accounts');
    await renderAccountsList();
}

async function openPockets() {
    openModal('modal-pockets');
    await renderPocketsList();
}

async function openAddTransaction(type = 'expense') {
    const txTypeInput = document.getElementById('tx-type');
    if (txTypeInput) txTypeInput.value = type;

    await fillAccountSelects(['tx-account']);

    // Set default categories from utils
    const categories = FinanzUtils.CATEGORIES[type];
    const catContainer = document.getElementById('category-options');
    if (catContainer) {
        catContainer.innerHTML = categories.map(cat => `
            <button type="button" class="assistant-suggestion" data-cat-id="${cat.id}" onclick="setTxCategory('${cat.id}')">
                <i class="fas ${cat.icon}"></i> ${cat.name}
            </button>
        `).join('');
    }

    // Reiniciar el campo de nombre personalizado de "Otros"
    const otherWrap = document.getElementById('tx-category-other-wrap');
    const otherInput = document.getElementById('tx-category-other');
    if (otherWrap) otherWrap.style.display = 'none';
    if (otherInput) otherInput.value = '';

    openModal('modal-add-transaction');
}

function setTxCategory(catId) {
    const catInput = document.getElementById('tx-category');
    if (catInput) catInput.value = catId;
    document.querySelectorAll('#category-options .assistant-suggestion').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.catId === catId);
    });

    // Si eligio "Otros", dejar que le ponga su propio nombre a la categoria
    const otherWrap = document.getElementById('tx-category-other-wrap');
    const otherInput = document.getElementById('tx-category-other');
    if (otherWrap) {
        otherWrap.style.display = catId === 'other' ? 'block' : 'none';
    }
    if (catId === 'other' && otherInput) {
        otherInput.focus();
    }
}

async function fillAccountSelects(selectIds) {
    const accounts = await FinanzData.getAccounts();
    selectIds.forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            if (accounts.length === 0) {
                select.innerHTML = '<option value="">-- Crea una cuenta primero --</option>';
            } else {
                select.innerHTML = accounts.map(a => `<option value="${a.id}">${a.name} (${FinanzUtils.formatCurrency(a.balance)})</option>`).join('');
            }
        }
    });
    return accounts.length > 0;
}

async function saveTransaction(e) {
    if (e) e.preventDefault();

    const accountId = document.getElementById('tx-account').value;
    if (!accountId) {
        showToast('Debes seleccionar o crear una cuenta primero', 'error');
        return;
    }

    let category = document.getElementById('tx-category').value;
    if (category === 'other') {
        const customName = (document.getElementById('tx-category-other')?.value || '').trim();
        if (customName) category = customName;
    }

    const tx = {
        amount: parseFloat(document.getElementById('tx-amount').value),
        title: document.getElementById('tx-title').value,
        type: document.getElementById('tx-type').value,
        category: category,
        accountId: accountId,
        note: document.getElementById('tx-note').value
    };

    try {
        const result = await FinanzData.addTransaction(tx);
        if (result) {
            closeModal('modal-add-transaction');
            showToast('Â¡Movimiento guardado!');
            await navigateTo(currentPage);
        } else {
            throw new Error('No se pudo guardar la transacciÃ³n');
        }
    } catch (err) {
        console.error('Save Transaction Error:', err);
        showToast('Error al guardar: ' + err.message, 'error');
    }
}

async function saveAccount(e) {
    if (e) e.preventDefault();
    const name = document.getElementById('acc-name').value;
    const balance = parseFloat(document.getElementById('acc-balance').value);
    const type = document.getElementById('acc-type').value;

    const acc = {
        name,
        balance,
        type,
        category: type
    };

    try {
        const result = await FinanzData.addAccount(acc);
        if (result) {
            closeModal('modal-add-account');
            showToast('Â¡Cuenta creada con Ã©xito!');
            await navigateTo(currentPage);
        } else {
            throw new Error('No se pudo crear la cuenta');
        }
    } catch (err) {
        console.error('Save Account Error:', err);
        showToast('Error al crear cuenta: ' + err.message, 'error');
    }
}

async function saveTransfer(e) {
    if (e) e.preventDefault();
    const amount = parseFloat(document.getElementById('tr-amount').value);
    const fromId = document.getElementById('tr-from-account').value;
    const toId = document.getElementById('tr-to-account').value;
    const note = document.getElementById('tr-note').value;

    if (fromId === toId) {
        showToast('Las cuentas deben ser diferentes', 'error');
        return;
    }

    const success = await FinanzData.transferBetweenAccounts(fromId, toId, amount, note);
    if (success) {
        closeModal('modal-transfer');
        showToast('Transferencia realizada');
        await navigateTo(currentPage);
    } else {
        showToast('Error en la transferencia', 'error');
    }
}

async function saveBudget(e) {
    if (e) e.preventDefault();
    const amount = parseFloat(document.getElementById('budget-amount').value);

    try {
        await FinanzData.updateSettings({ monthlyBudget: amount, dailyGoal: amount / 30 });
        closeModal('modal-budget');
        showToast('Presupuesto actualizado');

        // Refrescar datos globales
        if (typeof renderAnalysis === 'function') await renderAnalysis();
        if (typeof renderDashboard === 'function') await renderDashboard();

        await navigateTo(currentPage);
    } catch (err) {
        console.error('Save Budget Error:', err);
        showToast('Error al actualizar presupuesto: ' + err.message, 'error');
    }
}

async function openBudgetModal() {
    const settings = await FinanzData.getSettings();
    const budgetInput = document.getElementById('budget-amount');
    if (budgetInput) budgetInput.value = settings.monthlyBudget;
    openModal('modal-budget');
}

async function renderAccountsList() {
    const list = document.getElementById('accounts-list-modal');
    if (!list) return;
    const accounts = await FinanzData.getAccounts();

    list.innerHTML = accounts.map(acc => `
        <div class="account-item">
            <div class="account-info">
                <div class="account-name">${acc.name}</div>
                <div class="account-type">${acc.type}</div>
            </div>
            <div class="account-balance">${FinanzUtils.formatCurrency(acc.balance)}</div>
        </div>
    `).join('');

    const totalEl = document.getElementById('accounts-total');
    if (totalEl) {
        const total = accounts.reduce((s, a) => s + parseFloat(a.balance), 0);
        totalEl.textContent = FinanzUtils.formatCurrency(total);
    }
}

async function renderPocketsList() {
    const list = document.getElementById('pockets-list-modal');
    if (!list) return;
    const pockets = await FinanzData.getPockets();

    if (pockets.length === 0) {
        list.innerHTML = '<div class="empty-state">No tienes bolsillos de ahorro creados.</div>';
    } else {
        list.innerHTML = pockets.map(p => {
            const percentage = Math.min(100, (p.current_amount / p.target_amount) * 100).toFixed(0);
            return `
                <div class="pocket-item animate-fade-in" style="position: relative;">
                    <div style="position: absolute; top: 10px; right: 10px;">
                        <button onclick="handleDeletePocket('${p.id}')" style="background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 5px;">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                    <div class="pocket-header" style="padding-right: 30px;">
                        <div class="pocket-name">${p.name}</div>
                        <div class="pocket-percentage">${percentage}%</div>
                    </div>
                    <div class="pocket-progress-container">
                        <div class="pocket-progress-bar" style="width: ${percentage}%; background-color: ${p.color || 'var(--accent-primary)'}"></div>
                    </div>
                    <div class="pocket-meta">
                        <span>${FinanzUtils.formatCurrency(p.current_amount)}</span>
                        <span>Meta: ${FinanzUtils.formatCurrency(p.target_amount)}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    const totalEl = document.getElementById('pockets-total');
    if (totalEl) {
        const total = pockets.reduce((s, p) => s + parseFloat(p.current_amount), 0);
        totalEl.textContent = FinanzUtils.formatCurrency(total);
    }
}

async function handleDeletePocket(id) {
    if (confirm('Â¿EstÃ¡s seguro de que quieres eliminar este bolsillo? Si tiene dinero ahorrado, se devolverÃ¡ automÃ¡ticamente a tu primera cuenta.')) {
        try {
            await FinanzData.deletePocket(id);
            showToast('Bolsillo eliminado e historial actualizado');
            await renderPocketsList();
            await renderDashboardPockets();
            await renderDashboard(); // Refresca saldos en el Dashboard
        } catch (err) {
            console.error(err);
            showToast('Error al eliminar', 'error');
        }
    }
}

async function handleDeleteTransaction(id) {
    if (confirm('Â¿EstÃ¡s seguro de que quieres eliminar esta transacciÃ³n? El saldo de la cuenta se ajustarÃ¡ automÃ¡ticamente.')) {
        try {
            const success = await FinanzData.deleteTransaction(id);
            if (success) {
                showToast('TransacciÃ³n eliminada');
                // Recargar datos globales y de la vista actual
                await navigateTo(currentPage);
            } else {
                throw new Error('No se pudo completar la eliminaciÃ³n');
            }
        } catch (err) {
            console.error('Delete Transaction Error:', err);
            showToast('Error al eliminar: ' + err.message, 'error');
        }
    }
}

async function resetData() {
    if (confirm('âš ï¸ Â¿EstÃ¡s seguro de que quieres borrar TODOS los datos? Esta acciÃ³n eliminarÃ¡ todas tus transacciones, cuentas y bolsillos. NO se puede deshacer.')) {
        if (confirm('âš ï¸âš ï¸ ULTIMA ADVERTENCIA: Se borrarÃ¡ toda tu informaciÃ³n financiera. Â¿Confirmas el borrado total?')) {
            try {
                const success = await FinanzData.resetUserData();
                if (success) {
                    alert('Todos los datos han sido eliminados. La aplicaciÃ³n se reiniciarÃ¡.');
                    window.location.reload();
                } else {
                    throw new Error('No se pudo completar el borrado');
                }
            } catch (err) {
                console.error(err);
                showToast('Error al borrar los datos', 'error');
            }
        }
    }
}

async function savePocket(e) {
    if (e) e.preventDefault();
    const pocket = {
        name: document.getElementById('pocket-name').value,
        targetAmount: parseFloat(document.getElementById('pocket-target').value),
        color: document.getElementById('pocket-color').value,
        column: 'pockets'
    };
    await FinanzData.addPocket(pocket);
    closeModal('modal-add-pocket');
    showToast('Bolsillo creado');
    await navigateTo(currentPage);
}

// ===== UTILS UI =====
function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('active');
}
function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('active');
}
function showToast(msg) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.querySelector('.toast-message').textContent = msg;
    toast.classList.add('active');
    setTimeout(() => toast.classList.remove('active'), 3000);
}

// ===== ALERTAS DE PRESUPUESTO =====
async function checkBudgetAlerts() {
    try {
        const stats = await FinanzData.getDashboardStats();
        if (!stats || !(stats.monthlyBudget > 0)) return; // Sin presupuesto definido, nada que avisar

        const percent = parseFloat(stats.budgetPercentUsed) || 0;
        if (percent < 90) return;

        // Avisar una sola vez por dÃ­a para no repetir el toast en cada login/cambio de sesiÃ³n
        const alertKey = `budget-alert-shown-${new Date().toISOString().slice(0, 10)}`;
        if (sessionStorage.getItem(alertKey)) return;
        sessionStorage.setItem(alertKey, '1');

        if (percent >= 100) {
            showToast('Superaste tu presupuesto mensual', 'error');
        } else {
            showToast(`Ya usaste el ${stats.budgetPercentUsed}% de tu presupuesto mensual`, 'error');
        }
    } catch (err) {
        console.error('checkBudgetAlerts error:', err);
    }
}

function handleUrlParams() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'expense') setTimeout(() => openAddTransaction('expense'), 500);
}

// ===== ASISTENTE AI =====
async function assistantQuickAction(action) {
    const chat = document.getElementById('assistant-chat');
    if (!chat) return;

    let response = "";
    switch (action) {
        case 'analyze': response = "Analizando tus gastos... Veo que tu mayor gasto este mes es en Comida. Â¡PodrÃ­as ahorrar RD$2,000 si reduces las salidas!"; break;
        case 'add': closeModal('modal-assistant'); openAddTransaction('expense'); return;
        case 'budget': response = `Tu presupuesto mensual es de ${FinanzUtils.formatCurrency((await FinanzData.getSettings()).monthlyBudget)}. Te quedan ${FinanzUtils.formatCurrency((await FinanzData.getDashboardStats()).budgetRemaining)} para el resto del mes.`; break;
        case 'save': response = "Un consejo: Intenta la regla del 50/30/20. 50% Necesidades, 30% Deseos y 20% Ahorro."; break;
    }

    addChatMessage(response, 'bot');
}

function sendAssistantMessage() {
    const input = document.getElementById('assistant-input');
    if (!input || !input.value.trim()) return;

    const msg = input.value;
    addChatMessage(msg, 'user');
    input.value = "";

    setTimeout(() => {
        addChatMessage("Â¡Entendido! Estoy procesando tu solicitud...", 'bot');
    }, 500);
}

function addChatMessage(text, side) {
    const chat = document.getElementById('assistant-chat');
    if (!chat) return;

    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-message animate-fade-in ${side === 'user' ? 'user' : ''}`;
    msgDiv.innerHTML = `
    ${side === 'bot' ? '<div class="chat-avatar"><i class="fas fa-robot"></i></div>' : ''}
    <div class="chat-bubble">${text}</div>
`;
    chat.appendChild(msgDiv);
    chat.scrollTop = chat.scrollHeight;
}

async function setFilter(filter) {
    currentFilter = filter;

    // Actualizar UI
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.filter === filter);
    });

    // Recargar datos de la pÃ¡gina actual
    if (currentPage === 'transactions') await renderTransactions();
    if (currentPage === 'analysis') await renderAnalysis();
}

async function setTransactionType(type) {
    currentTransactionType = type;

    // Actualizar UI
    document.querySelectorAll('.type-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.type === type);
    });

    await renderTransactions();
}

// ===== SIDEBAR CONTROL =====
function toggleSidebar() {
    const overlay = document.getElementById('sidebar-overlay');
    if (overlay) {
        if (overlay.classList.contains('active')) {
            closeSidebar();
        } else {
            openSidebar();
        }
    }
}

function updateUserProfileUI() {
    const userName = FinanzData.user?.user_metadata?.full_name || FinanzData.user?.user_metadata?.name || FinanzData.user?.email?.split('@')[0] || 'Usuario Demo';
    const userEmail = FinanzData.user?.email || 'demo@finia.app';
    const initials = userName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'UD';

    // 1. Sidebar
    const sbName = document.getElementById('sidebar-user-name');
    const sbEmail = document.getElementById('sidebar-user-email');
    if (sbName) sbName.textContent = userName;
    if (sbEmail) sbEmail.textContent = userEmail;

    // 2. Dashboard Header Initials
    const headerInitials = document.getElementById('user-initials');
    if (headerInitials) headerInitials.textContent = initials;

    // 2b. Saludo del dashboard segun la hora del dia
    const dashGreeting = document.getElementById('dash-greeting');
    if (dashGreeting) {
        const hour = new Date().getHours();
        const timeGreeting = hour < 12 ? 'Buenos días' : (hour < 19 ? 'Buenas tardes' : 'Buenas noches');
        const firstName = userName.split(' ')[0];
        dashGreeting.textContent = `${timeGreeting}, ${firstName} 👋`;
    }

    // 3. AI Assistant Greeting
    const assistantGreeting = document.getElementById('user-name');
    if (assistantGreeting) assistantGreeting.textContent = `Hola, ${userName}`;

    // 4. Profile Page
    const profileName = document.getElementById('profile-name');
    const profileEmail = document.getElementById('profile-email');
    const profileAvatar = document.getElementById('profile-avatar-text');
    if (profileName) profileName.textContent = userName;
    if (profileEmail) profileEmail.textContent = userEmail;
    if (profileAvatar) profileAvatar.textContent = initials;
}

async function openSidebar() {
    const overlay = document.getElementById('sidebar-overlay');
    const drawer = document.getElementById('sidebar-drawer');
    if (overlay && drawer) {
        overlay.classList.add('active');
        updateUserProfileUI();
    }
}

function closeSidebar() {
    const overlay = document.getElementById('sidebar-overlay');
    if (overlay) overlay.classList.remove('active');
}

async function handleLogout() {
    closeSidebar();

    // Mostramos un mensajito para dar feedback
    showToast('Cerrando sesión...');

    setTimeout(async () => {
        await FinanzData.logout();
    }, 300);
}

async function openDepositModal(id, name) {
    document.getElementById('deposit-pocket-id').value = id;
    document.getElementById('deposit-pocket-name').value = name;
    document.getElementById('deposit-amount').value = '';

    await fillAccountSelects(['deposit-from-account']);

    // Add option for 'No Account / External Cash'
    const select = document.getElementById('deposit-from-account');
    if (select) {
        const option = document.createElement('option');
        option.value = "";
        option.text = "Efectivo / Externo (Solo sumar)";
        select.add(option, 0);
        select.value = "";
    }

    openModal('modal-deposit-pocket');
}

async function savePocketDeposit(e) {
    if (e) e.preventDefault();

    const pocketId = document.getElementById('deposit-pocket-id').value;
    const amount = parseFloat(document.getElementById('deposit-amount').value);
    const fromAccountId = document.getElementById('deposit-from-account').value;

    if (!amount || amount <= 0) {
        showToast('Ingresa un monto vÃ¡lido', 'error');
        return;
    }

    try {
        const success = await FinanzData.depositToPocket(pocketId, amount, fromAccountId || null);
        if (success) {
            closeModal('modal-deposit-pocket');
            showToast('Â¡Ahorro guardado!');
            await renderDashboardPockets();
            if (typeof renderPocketsList === 'function') await renderPocketsList();

            // Actualizar datos globales si hubo movimiento de cuenta
            if (fromAccountId) {
                await renderDashboard(); // Actualiza saldos de cuentas
            }
        } else {
            throw new Error('Error al guardar');
        }
    } catch (err) {
        console.error('Deposit Error:', err);
        showToast(err.message || 'Error al depositar', 'error');
    }
}

// Expose globals for HTML calls
window.openDepositModal = openDepositModal;
window.savePocketDeposit = savePocketDeposit;
window.handleDeletePocket = handleDeletePocket;
window.handleDeleteTransaction = handleDeleteTransaction;
window.resetData = resetData;
window.handleAuth = handleAuth;
window.toggleAuthPassword = toggleAuthPassword;
window.toggleAuthTheme = toggleAuthTheme;
window.navigateTo = navigateTo;
window.quickAction = quickAction;
window.openAccounts = openAccounts;
window.openPockets = openPockets;
window.openModal = openModal;
window.closeModal = closeModal;
window.saveTransaction = saveTransaction;
window.saveAccount = saveAccount;
window.savePocket = savePocket;
window.saveTransfer = saveTransfer;
window.saveBudget = saveBudget;
window.openBudgetModal = openBudgetModal;
window.setTxCategory = setTxCategory;
window.openAddTransaction = openAddTransaction;
window.assistantQuickAction = assistantQuickAction;
window.sendAssistantMessage = sendAssistantMessage;
window.setFilter = setFilter;
window.setTransactionType = setTransactionType;
window.setAnalysisType = setAnalysisType;
window.changeCalendarMonth = changeCalendarMonth;
window.setDashboardPeriod = setDashboardPeriod;
window.toggleDashPeriodMenu = toggleDashPeriodMenu;
window.openAssistant = () => openModal('modal-assistant');
window.toggleSidebar = toggleSidebar;
window.openSidebar = openSidebar;
window.closeSidebar = closeSidebar;
window.handleLogout = handleLogout;



