/**
 * Finia - Data Layer (Supabase Cloud)
 */

class FinanzDataService {
    constructor() {
        this.client = window.supabaseClient;
        this.user = null;
        this.lastAccessError = null;
    }

    async init() {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('loggedout') === '1') {
            try {
                await this.client.auth.signOut();
            } catch (e) {}
            const cleanUrl = window.location.pathname;
            window.history.replaceState({}, document.title, cleanUrl);
            this.user = null;
            return false;
        }

        const { data: { session } } = await this.client.auth.getSession();

        if (session?.user) {
            this.user = session.user;
            return true;
        }

        const { data: { user } } = await this.client.auth.getUser();
        this.user = user;
        if (!user) {
            this.lastAccessError = null;
            return false;
        }

        const { data: accessRow, error: accessError } = await this.client
            .from('app_access')
            .select('enabled')
            .eq('user_id', user.id)
            .maybeSingle();

        if (accessError || !accessRow || accessRow.enabled === false) {
            this.lastAccessError = 'Tu cuenta no está autorizada para usar esta app.';
            try {
                await this.client.auth.signOut();
            } catch (e) {}
            this.user = null;
            return false;
        }

        this.lastAccessError = null;
        return true;
    }
// ===== PROFILE & SETTINGS =====
    async getSettings() {
        if (!this.user) return { monthlyBudget: 0, dailyGoal: 0, currency: 'DOP' };
        const { data } = await this.client
            .from('profiles')
            .select('*')
            .eq('id', this.user.id)
            .maybeSingle();

        return {
            monthlyBudget: parseFloat(data?.monthly_budget || 0),
            dailyGoal: parseFloat(data?.daily_goal || 0),
            currency: data?.currency || 'DOP'
        };
    }

    async updateSettings(settings) {
        if (!this.user) return;
        const { error } = await this.client
            .from('profiles')
            .upsert({
                id: this.user.id,
                monthly_budget: settings.monthlyBudget,
                daily_goal: settings.dailyGoal
            });

        if (error) {
            console.error('Supabase Update Error:', error);
            throw error;
        }
    }

    // ===== ACCOUNTS =====
    async getAccounts() {
        if (!this.user) return [];
        const { data } = await this.client
            .from('accounts')
            .select('*')
            .order('name');
        return data || [];
    }

    async addAccount(account) {
        if (!this.user) return;
        const { data, error } = await this.client
            .from('accounts')
            .insert([{
                user_id: this.user.id,
                name: account.name,
                balance: account.balance,
                type: account.type,
                category: account.category
            }])
            .select()
            .single();
        
        if (error) {
            console.error('addAccount Error:', error);
            throw new Error(error.message);
        }
        return data;
    }

    async transferBetweenAccounts(fromId, toId, amount, note) {
        if (!this.user) return false;

        // 1. Validar existencia y saldo en origen
        const { data: fromAcc } = await this.client.from('accounts').select('balance').eq('id', fromId).single();
        const { data: toAcc } = await this.client.from('accounts').select('balance').eq('id', toId).single();

        if (!fromAcc || !toAcc) return false;

        if (parseFloat(fromAcc.balance) < amount) {
            throw new Error('Saldo insuficiente en la cuenta de origen');
        }

        // 2. Registrar transacción de transferencia (addTransaction descontará de origen y sumará a destino automáticamente)
        await this.addTransaction({
            accountId: fromId,
            type: 'expense',
            category: 'Transferencia',
            title: `Transferencia enviada: ${note || ''}`,
            amount: amount,
            note: `Hacia cuenta destino`
        });

        await this.addTransaction({
            accountId: toId,
            type: 'income',
            category: 'Transferencia',
            title: `Transferencia recibida: ${note || ''}`,
            amount: amount,
            note: `Desde cuenta origen`
        });

        return true;
    }

    // ===== POCKETS =====
    async getPockets() {
        if (!this.user) return [];
        const { data } = await this.client
            .from('pockets')
            .select('*')
            .order('name');
        return data || [];
    }

    async addPocket(pocket) {
        if (!this.user) return;
        const { data, error } = await this.client
            .from('pockets')
            .insert([{
                user_id: this.user.id,
                name: pocket.name,
                target_amount: pocket.targetAmount,
                current_amount: pocket.currentAmount || 0,
                color: pocket.color,
                icon: pocket.icon
            }])
            .select()
            .single();
            
        if (error) {
            console.error('addPocket Error:', error);
            throw new Error(error.message);
        }
        return data;
    }

    async depositToPocket(pocketId, amount, fromAccountId = null) {
        if (!this.user) return false;

        // 1. Obtener bolsillo actual
        const { data: pocket } = await this.client
            .from('pockets')
            .select('current_amount, name')
            .eq('id', pocketId)
            .single();

        if (!pocket) return false;

        // 2. Si hay cuenta de origen, validar saldo y crear transacción (addTransaction restará saldo automáticamente)
        if (fromAccountId) {
            const { data: account } = await this.client
                .from('accounts')
                .select('balance')
                .eq('id', fromAccountId)
                .single();

            if (account) {
                if (parseFloat(account.balance) < amount) throw new Error('Saldo insuficiente en la cuenta');

                await this.addTransaction({
                    accountId: fromAccountId,
                    type: 'expense',
                    category: 'Ahorro',
                    title: `Ahorro para ${pocket.name}`,
                    amount: amount,
                    note: 'Depósito a bolsillo'
                });
            }
        }

        // 3. Actualizar bolsillo
        const newAmount = parseFloat(pocket.current_amount) + amount;
        const { error } = await this.client
            .from('pockets')
            .update({ current_amount: newAmount })
            .eq('id', pocketId);

        return !error;
    }

    async deletePocket(id) {
        if (!this.user) return false;

        try {
            // 1. Obtener la información del bolsillo antes de eliminarlo
            const { data: pocket, error: fetchError } = await this.client
                .from('pockets')
                .select('*')
                .eq('id', id)
                .single();

            if (fetchError || !pocket) {
                console.error('Error fetching pocket before deletion:', fetchError);
                return false;
            }

            const refundAmount = parseFloat(pocket.current_amount || 0);

            // 2. Si el bolsillo tiene dinero ahorrado, devolverlo a una cuenta
            if (refundAmount > 0) {
                const { data: accounts } = await this.client
                    .from('accounts')
                    .select('*')
                    .eq('user_id', this.user.id)
                    .order('name');

                if (accounts && accounts.length > 0) {
                    // Devolver a la primera cuenta
                    const targetAccount = accounts[0];

                    // Crear transacción de reintegro (actualizará el saldo de la cuenta automáticamente)
                    await this.addTransaction({
                        accountId: targetAccount.id,
                        type: 'income',
                        category: 'Ahorro',
                        title: `Reintegro: Bolsillo '${pocket.name}' eliminado`,
                        amount: refundAmount,
                        note: 'Reintegro automático por eliminación de bolsillo'
                    });
                }
            }

            // 3. Eliminar el bolsillo
            const { error } = await this.client
                .from('pockets')
                .delete()
                .eq('id', id);

            return !error;
        } catch (err) {
            console.error('deletePocket Error:', err);
            return false;
        }
    }

    async resetUserData() {
        if (!this.user) return false;

        // Orden de borrado por FKs: Transacciones -> Bolsillos -> Cuentas
        const { error: err1 } = await this.client.from('transactions').delete().eq('user_id', this.user.id);
        if (err1) return false;

        const { error: err2 } = await this.client.from('pockets').delete().eq('user_id', this.user.id);
        if (err2) return false;

        const { error: err3 } = await this.client.from('accounts').delete().eq('user_id', this.user.id);
        if (err3) return false;

        return true;
    }

    // ===== TRANSACTIONS =====
    async getTransactions(filters = {}) {
        if (!this.user) return [];
        let query = this.client
            .from('transactions')
            .select('*')
            .order('date', { ascending: false })
            .order('created_at', { ascending: false });

        if (filters.type && filters.type !== 'all') query = query.eq('type', filters.type);

        const period = filters.period || '30days';
        const range = FinanzUtils.getDateRange(period);
        query = query.gte('date', range.start.toISOString().split('T')[0])
            .lte('date', range.end.toISOString().split('T')[0]);

        const { data } = await query;
        return data || [];
    }

    // Trae las transacciones dentro de un rango exacto de fechas (para el
    // calendario, donde se necesita un mes calendario especifico y no uno
    // de los periodos relativos de getDateRange).
    async getTransactionsInRange(startDateISO, endDateISO) {
        if (!this.user) return [];
        const { data } = await this.client
            .from('transactions')
            .select('*')
            .gte('date', startDateISO)
            .lte('date', endDateISO)
            .order('date', { ascending: true });
        return data || [];
    }

    async addTransaction(tx) {
        if (!this.user) return;

        const { data: newTx, error } = await this.client
            .from('transactions')
            .insert([{
                user_id: this.user.id,
                account_id: tx.accountId,
                type: tx.type,
                category: tx.category,
                title: tx.title,
                amount: tx.amount,
                date: tx.date || new Date().toISOString().split('T')[0],
                note: tx.note
            }])
            .select()
            .single();

        if (error) {
            console.error('addTransaction Error:', error);
            throw new Error(error.message);
        }

        const { data: account } = await this.client
            .from('accounts')
            .select('balance')
            .eq('id', tx.accountId)
            .single();

        if (account) {
            const newBalance = tx.type === 'income'
                ? parseFloat(account.balance) + tx.amount
                : parseFloat(account.balance) - tx.amount;

            await this.client
                .from('accounts')
                .update({ balance: newBalance })
                .eq('id', tx.accountId);
        }

        return newTx;
    }

    async deleteTransaction(id) {
        if (!this.user) return false;

        try {
            // 1. Obtener la transacción antes de eliminarla
            const { data: tx, error: getError } = await this.client
                .from('transactions')
                .select('*')
                .eq('id', id)
                .single();

            if (getError || !tx) {
                console.error('Error fetching transaction before deletion:', getError);
                return false;
            }

            // 2. Eliminar la transacción
            const { error: deleteError } = await this.client
                .from('transactions')
                .delete()
                .eq('id', id);

            if (deleteError) {
                console.error('Error deleting transaction:', deleteError);
                return false;
            }

            // 3. Revertir el saldo de la cuenta
            const { data: account } = await this.client
                .from('accounts')
                .select('balance')
                .eq('id', tx.account_id)
                .single();

            if (account) {
                const amount = parseFloat(tx.amount);
                const newBalance = tx.type === 'income'
                    ? parseFloat(account.balance) - amount
                    : parseFloat(account.balance) + amount;

                await this.client
                    .from('accounts')
                    .update({ balance: newBalance })
                    .eq('id', tx.account_id);
            }

            return true;
        } catch (err) {
            console.error('deleteTransaction Error:', err);
            return false;
        }
    }

    async getChartData(type, period) {
        if (!this.user) return { labels: [], data: [] };
        const txs = await this.getTransactions({ type, period });

        // Agrupar por fecha
        const groups = {};
        const range = FinanzUtils.getDateRange(period);

        // Inicializar todas las fechas en el rango con 0
        let curr = new Date(range.start);
        while (curr <= range.end) {
            const dayStr = curr.toISOString().split('T')[0];
            groups[dayStr] = 0;
            curr.setDate(curr.getDate() + 1);
        }

        txs.forEach(t => {
            const day = t.date;
            if (groups[day] !== undefined) {
                groups[day] += parseFloat(t.amount);
            }
        });

        const labels = Object.keys(groups).map(d => FinanzUtils.formatDate(d));
        const data = Object.values(groups);

        return { labels, data };
    }


    // ===== DASHBOARD STATS =====
    async getDashboardStats(period = '30days') {
        const settings = await this.getSettings();
        const accounts = await this.getAccounts();
        const pockets = await this.getPockets();
        const txs = await this.getTransactions({ period });

        const available = accounts.reduce((s, a) => s + parseFloat(a.balance), 0);
        const saved = pockets.reduce((s, p) => s + parseFloat(p.current_amount), 0);
        const totalBalance = available + saved;

        const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + parseFloat(t.amount), 0);
        const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + parseFloat(t.amount), 0);

        const range = FinanzUtils.getDateRange(period);
        const days = Math.max(1, Math.ceil((range.end - range.start) / (1000 * 60 * 60 * 24)));

        return {
            totalBalance,
            available,
            saved,
            income,
            expense,
            transactionCount: txs.length,
            monthlyBudget: settings.monthlyBudget,
            budgetRemaining: settings.monthlyBudget - expense,
            budgetPercentUsed: settings.monthlyBudget > 0 ? ((expense / settings.monthlyBudget) * 100).toFixed(0) : 0,
            dailyAverage: expense / days,
            dailyNet: (income - expense) / days, // New Metric: Net Income per Day
            days: days // Return calculated days
        };
    }

    // Comparacion contra el periodo equivalente inmediatamente anterior
    // (misma duracion). Solo usa transacciones reales; si el periodo
    // anterior no tiene datos para comparar, el cambio queda en null en
    // vez de inventar un porcentaje.
    async getPeriodComparison(period = 'thisMonth') {
        if (!this.user) return null;

        const accounts = await this.getAccounts();
        const pockets = await this.getPockets();
        const totalBalance = accounts.reduce((s, a) => s + parseFloat(a.balance), 0)
            + pockets.reduce((s, p) => s + parseFloat(p.current_amount), 0);

        const currentTxs = await this.getTransactions({ period });
        const currentIncome = currentTxs.filter(t => t.type === 'income').reduce((s, t) => s + parseFloat(t.amount), 0);
        const currentExpense = currentTxs.filter(t => t.type === 'expense').reduce((s, t) => s + parseFloat(t.amount), 0);

        const prevRange = FinanzUtils.getPreviousPeriodRange(period);
        const toISO = (d) => d.toISOString().split('T')[0];
        const prevTxs = await this.getTransactionsInRange(toISO(prevRange.start), toISO(prevRange.end));
        const prevIncome = prevTxs.filter(t => t.type === 'income').reduce((s, t) => s + parseFloat(t.amount), 0);
        const prevExpense = prevTxs.filter(t => t.type === 'expense').reduce((s, t) => s + parseFloat(t.amount), 0);

        const pct = (curr, prev) => (prev === 0 ? null : ((curr - prev) / Math.abs(prev)) * 100);

        // El patrimonio al cierre del periodo anterior es, por definicion,
        // el patrimonio actual menos el neto (ingresos-gastos) de este
        // periodo: no hace falta reconstruir nada aparte para este dato.
        const netCurrent = currentIncome - currentExpense;
        const patrimonyBeforePeriod = totalBalance - netCurrent;

        return {
            totalBalance,
            currentIncome,
            currentExpense,
            prevIncome,
            prevExpense,
            incomeChangePct: pct(currentIncome, prevIncome),
            expenseChangePct: pct(currentExpense, prevExpense),
            patrimonyChangePct: pct(totalBalance, patrimonyBeforePeriod)
        };
    }

    // Reconstruye la evolucion diaria del patrimonio total (cuentas +
    // bolsillos) a partir del saldo real actual y el neto ingreso-gasto
    // de cada dia del ledger. No inventa numeros: el unico dato "fijo" es
    // el saldo actual real, y cada dia anterior se deriva restando el neto
    // real de ese dia.
    // Nota: un deposito a un bolsillo financiado desde una cuenta se
    // registra como gasto en el ledger (ver depositToPocket), aunque el
    // patrimonio total no cambia realmente al mover dinero de una cuenta a
    // un bolsillo propio. Es una limitacion conocida de los datos, no del
    // calculo: puede verse una baja momentanea al ahorrar hacia una meta.
    async getPatrimonyHistory(period = 'thisMonth') {
        if (!this.user) return { labels: [], data: [] };

        const accounts = await this.getAccounts();
        const pockets = await this.getPockets();
        const currentBalance = accounts.reduce((s, a) => s + parseFloat(a.balance), 0)
            + pockets.reduce((s, p) => s + parseFloat(p.current_amount), 0);

        const range = FinanzUtils.getDateRange(period);
        const toISO = (d) => d.toISOString().split('T')[0];
        const txs = await this.getTransactionsInRange(toISO(range.start), toISO(range.end));

        // Guardamos tanto el string ISO (clave del ledger) como el Date local
        // original (para las etiquetas). Formatear la etiqueta reparseando el
        // string ISO con `new Date("YYYY-MM-DD")` lo interpretaria como
        // medianoche UTC, que en timezones detras de UTC (ej. RD, UTC-4) se
        // muestra como el dia anterior al formatear en hora local.
        const days = [];
        const dayDates = [];
        const cursor = new Date(range.start);
        cursor.setHours(0, 0, 0, 0);
        const today = new Date(range.end);
        today.setHours(0, 0, 0, 0);
        while (cursor <= today) {
            days.push(toISO(cursor));
            dayDates.push(new Date(cursor));
            cursor.setDate(cursor.getDate() + 1);
        }
        if (days.length === 0) {
            days.push(toISO(today));
            dayDates.push(new Date(today));
        }

        const netByDay = {};
        txs.forEach(t => {
            const day = t.date.slice(0, 10);
            const amount = parseFloat(t.amount);
            netByDay[day] = (netByDay[day] || 0) + (t.type === 'income' ? amount : -amount);
        });

        const balances = new Array(days.length);
        balances[days.length - 1] = currentBalance;
        for (let i = days.length - 1; i > 0; i--) {
            balances[i - 1] = balances[i] - (netByDay[days[i]] || 0);
        }

        return {
            labels: dayDates.map(d => FinanzUtils.formatDate(d, 'short')),
            data: balances
        };
    }

    async getCategoryStats(type, period = '30days') {
        if (!this.user) return [];
        const txs = await this.getTransactions({ type, period });
        const totals = {};
        let grandTotal = 0;

        txs.forEach(t => {
            const amount = parseFloat(t.amount);
            totals[t.category] = (totals[t.category] || 0) + amount;
            grandTotal += amount;
        });

        // Convertir a array con info de utils
        const stats = Object.entries(totals).map(([catId, amount]) => {
            const info = FinanzUtils.getCategoryInfo(type, catId);
            return {
                id: catId,
                name: info.name,
                icon: info.icon,
                class: info.class,
                amount: amount,
                percentage: grandTotal > 0 ? Math.round((amount / grandTotal) * 100) : 0
            };
        }).sort((a, b) => b.amount - a.amount);

        return stats;
    }

    async logout() {
        // Limpiar almacenamiento local primero
        localStorage.clear();
        sessionStorage.clear();

        try {
            // Intentar cerrar sesión en Supabase (scope global para todos los dispositivos)
            await this.client.auth.signOut({ scope: 'global' });
        } catch (e) {
            console.error('Logout error:', e);
        }

        this.user = null;

        // SOLUCIÓN DEFINITIVA: Redirigir con parámetro ?loggedout=1 + timestamp
        // El timestamp hace que el browser no pueda usar caché y la URL nueva
        // hace que el Service Worker trate esto como una visita fresca.
        // replace() elimina esta entrada del historial, así el botón atrás no regresa aquí.
        window.location.replace(window.location.pathname + '?loggedout=1&t=' + Date.now());
    }
}

window.FinanzData = new FinanzDataService();


