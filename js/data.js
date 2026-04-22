/**
 * FinanzApp - Data Layer (Supabase Cloud)
 */

class FinanzDataService {
    constructor() {
        this.client = window.supabaseClient;
        this.user = null;
    }

    async init() {
        const { data: { user } } = await this.client.auth.getUser();
        this.user = user;
        return !!user;
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
        const { data } = await this.client
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
        return data;
    }

    async transferBetweenAccounts(fromId, toId, amount, note) {
        if (!this.user) return false;

        // 1. Descontar de origen
        const { data: fromAcc } = await this.client.from('accounts').select('balance').eq('id', fromId).single();
        const { data: toAcc } = await this.client.from('accounts').select('balance').eq('id', toId).single();

        if (!fromAcc || !toAcc) return false;

        await this.client.from('accounts').update({ balance: parseFloat(fromAcc.balance) - amount }).eq('id', fromId);
        await this.client.from('accounts').update({ balance: parseFloat(toAcc.balance) + amount }).eq('id', toId);

        // 2. Registrar transacción de transferencia (opcional, pero útil para el histórico)
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
        const { data } = await this.client
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

        // 2. Si hay cuenta de origen, restar saldo y crear transacción
        if (fromAccountId) {
            const { data: account } = await this.client
                .from('accounts')
                .select('balance')
                .eq('id', fromAccountId)
                .single();

            if (account) {
                if (parseFloat(account.balance) < amount) throw new Error('Saldo insuficiente en la cuenta');

                await this.client
                    .from('accounts')
                    .update({ balance: parseFloat(account.balance) - amount })
                    .eq('id', fromAccountId);

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
        const { error } = await this.client
            .from('pockets')
            .delete()
            .eq('id', id);
        return !error;
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

    async addTransaction(tx) {
        if (!this.user) return;

        const { data: newTx } = await this.client
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
        await this.client.auth.signOut();
        window.location.reload();
    }
}

window.FinanzData = new FinanzDataService();
