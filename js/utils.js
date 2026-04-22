
/**
 * FinanzApp - Utilidades
 * Funciones de ayuda y formateo
 */

// ===== FORMATEO DE MONEDA =====
function formatCurrency(amount, showSign = false) {
    const formatted = new Intl.NumberFormat('es-DO', {
        style: 'currency',
        currency: 'DOP',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(Math.abs(amount));
    
    // Cambiar DOP por RD$ y agregar signo si es necesario
    let result = formatted.replace('DOP', 'RD$').replace('RD$', '$');
    
    if (showSign && amount !== 0) {
        result = amount > 0 ? `+${result}` : `-${result}`;
    } else if (amount < 0) {
        result = `-${result}`;
    }
    
    return result;
}

// Formato compacto para números grandes
function formatCompact(amount) {
    if (Math.abs(amount) >= 1000000) {
        return `$${(amount / 1000000).toFixed(1)}M`;
    } else if (Math.abs(amount) >= 1000) {
        return `$${(amount / 1000).toFixed(0)}K`;
    }
    return formatCurrency(amount);
}

// ===== FORMATEO DE FECHAS =====
function formatDate(date, format = 'short') {
    const d = new Date(date);
    const options = {
        short: { day: 'numeric', month: 'short' },
        medium: { day: 'numeric', month: 'short', year: 'numeric' },
        long: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
        time: { hour: '2-digit', minute: '2-digit', hour12: true },
        full: { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    };
    
    return d.toLocaleDateString('es-DO', options[format] || options.short);
}

function formatTime(date) {
    const d = new Date(date);
    return d.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatRelativeDate(date) {
    const d = new Date(date);
    const now = new Date();
    const diff = now - d;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Hoy';
    if (days === 1) return 'Ayer';
    if (days < 7) return `Hace ${days} días`;
    if (days < 30) return `Hace ${Math.floor(days / 7)} semanas`;
    return formatDate(date, 'medium');
}

function getDateRange(period) {
    const now = new Date();
    const start = new Date();
    
    switch (period) {
        case 'today':
            start.setHours(0, 0, 0, 0);
            break;
        case 'yesterday':
            start.setDate(start.getDate() - 1);
            start.setHours(0, 0, 0, 0);
            now.setDate(now.getDate() - 1);
            now.setHours(23, 59, 59, 999);
            break;
        case 'week':
            start.setDate(start.getDate() - 7);
            break;
        case 'month':
            start.setMonth(start.getMonth() - 1);
            break;
        case '30days':
        default:
            start.setDate(start.getDate() - 30);
            break;
    }
    
    return { start, end: now };
}

// ===== GENERADORES DE ID =====
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// ===== VALIDACIONES =====
function isValidAmount(value) {
    const num = parseFloat(value);
    return !isNaN(num) && num > 0;
}

function isValidDate(date) {
    const d = new Date(date);
    return d instanceof Date && !isNaN(d);
}

// ===== HELPERS DE CATEGORÍAS =====
const CATEGORIES = {
    expense: [
        { id: 'food', name: 'Comida', icon: 'fa-utensils', class: 'food' },
        { id: 'transport', name: 'Transporte', icon: 'fa-car', class: 'transport' },
        { id: 'shopping', name: 'Compras', icon: 'fa-shopping-bag', class: 'shopping' },
        { id: 'entertainment', name: 'Entretenimiento', icon: 'fa-film', class: 'entertainment' },
        { id: 'health', name: 'Salud', icon: 'fa-heartbeat', class: 'health' },
        { id: 'bills', name: 'Servicios', icon: 'fa-file-invoice', class: 'bills' },
        { id: 'education', name: 'Educación', icon: 'fa-graduation-cap', class: 'education' },
        { id: 'other', name: 'Otros', icon: 'fa-ellipsis-h', class: 'default' }
    ],
    income: [
        { id: 'salary', name: 'Salario', icon: 'fa-briefcase', class: 'income' },
        { id: 'freelance', name: 'Freelance', icon: 'fa-laptop', class: 'income' },
        { id: 'investment', name: 'Inversión', icon: 'fa-chart-line', class: 'income' },
        { id: 'gift', name: 'Regalo', icon: 'fa-gift', class: 'income' },
        { id: 'other', name: 'Otros', icon: 'fa-plus-circle', class: 'income' }
    ]
};

function getCategoryInfo(type, categoryId) {
    const categories = CATEGORIES[type] || CATEGORIES.expense;
    return categories.find(c => c.id === categoryId) || categories[categories.length - 1];
}

// ===== ICONOS DE CUENTAS =====
const ACCOUNT_TYPES = {
    cash: { name: 'Efectivo', icon: '$', class: 'cash' },
    nubank: { name: 'Nubank', icon: 'N', class: 'nubank' },
    nequi: { name: 'Nequi', icon: 'N', class: 'nequi' },
    lulobank: { name: 'Lulobank', icon: 'L', class: 'lulobank' },
    default: { name: 'Cuenta', icon: 'B', class: 'default' }
};

function getAccountInfo(type) {
    return ACCOUNT_TYPES[type] || ACCOUNT_TYPES.default;
}

// ===== ICONOS DE BOLSILLOS =====
const POCKET_ICONS = {
    home: { icon: 'fa-home', class: 'home' },
    travel: { icon: 'fa-plane', class: 'travel' },
    car: { icon: 'fa-car', class: 'car' },
    education: { icon: 'fa-graduation-cap', class: 'education' },
    emergency: { icon: 'fa-shield-alt', class: 'emergency' },
    default: { icon: 'fa-piggy-bank', class: 'default' }
};

function getPocketIcon(iconId) {
    return POCKET_ICONS[iconId] || POCKET_ICONS.default;
}

// ===== CÁLCULOS =====
function calculatePercentage(current, total) {
    if (total === 0) return 0;
    return Math.min(100, Math.round((current / total) * 100));
}

function calculateDailyAverage(total, days = 30) {
    return total / days;
}

// ===== STORAGE HELPERS =====
function saveToStorage(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
        return true;
    } catch (e) {
        console.error('Error saving to storage:', e);
        return false;
    }
}

function loadFromStorage(key, defaultValue = null) {
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : defaultValue;
    } catch (e) {
        console.error('Error loading from storage:', e);
        return defaultValue;
    }
}

function removeFromStorage(key) {
    try {
        localStorage.removeItem(key);
        return true;
    } catch (e) {
        console.error('Error removing from storage:', e);
        return false;
    }
}

// ===== DEBOUNCE =====
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ===== FORMATEO DE NÚMEROS =====
function formatNumber(num) {
    return new Intl.NumberFormat('es-DO').format(num);
}

// ===== COLORES PARA GRÁFICAS =====
const CHART_COLORS = {
    primary: '#CAFD0A',
    secondary: '#8BB800',
    danger: '#FF4444',
    success: '#00D26A',
    info: '#00B4D8',
    warning: '#FFB800',
    gray: '#888888',
    background: '#1A1A1A'
};

// Exportar para uso global
window.FinanzUtils = {
    formatCurrency,
    formatCompact,
    formatDate,
    formatTime,
    formatRelativeDate,
    getDateRange,
    generateId,
    isValidAmount,
    isValidDate,
    getCategoryInfo,
    getAccountInfo,
    getPocketIcon,
    calculatePercentage,
    calculateDailyAverage,
    saveToStorage,
    loadFromStorage,
    removeFromStorage,
    debounce,
    formatNumber,
    CATEGORIES,
    ACCOUNT_TYPES,
    POCKET_ICONS,
    CHART_COLORS
};
