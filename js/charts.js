/**
 * FinanzApp - Charts
 * Configuración de Chart.js
 */

// Configuración global de Chart.js
Chart.defaults.color = '#888888';
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.font.size = 12;

// ===== GRÁFICA DE LÍNEA PARA GASTOS =====
function createExpenseChart(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    // Destruir gráfica existente si hay
    const existingChart = Chart.getChart(ctx);
    if (existingChart) {
        existingChart.destroy();
    }

    const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, 'rgba(255, 68, 68, 0.3)');
    gradient.addColorStop(1, 'rgba(255, 68, 68, 0)');

    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [{
                label: 'Gastos',
                data: data.data,
                borderColor: '#FF4444',
                backgroundColor: gradient,
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 6,
                pointHoverBackgroundColor: '#FF4444',
                pointHoverBorderColor: '#FFFFFF',
                pointHoverBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: '#1A1A1A',
                    titleColor: '#FFFFFF',
                    bodyColor: '#FFFFFF',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        label: function (context) {
                            return FinanzUtils.formatCurrency(context.raw);
                        }
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    grid: {
                        display: false
                    },
                    ticks: {
                        maxTicksLimit: 7,
                        color: '#555555'
                    }
                },
                y: {
                    display: true,
                    position: 'right',
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        maxTicksLimit: 5,
                        color: '#555555',
                        callback: function (value) {
                            return FinanzUtils.formatCompact(value);
                        }
                    }
                }
            }
        }
    });
}

// ===== GRÁFICA DE INGRESOS =====
function createIncomeChart(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    const existingChart = Chart.getChart(ctx);
    if (existingChart) {
        existingChart.destroy();
    }

    const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, 'rgba(0, 210, 106, 0.3)');
    gradient.addColorStop(1, 'rgba(0, 210, 106, 0)');

    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [{
                label: 'Ingresos',
                data: data.data,
                borderColor: '#00D26A',
                backgroundColor: gradient,
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 6,
                pointHoverBackgroundColor: '#00D26A',
                pointHoverBorderColor: '#FFFFFF',
                pointHoverBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: '#1A1A1A',
                    titleColor: '#FFFFFF',
                    bodyColor: '#FFFFFF',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        label: function (context) {
                            return FinanzUtils.formatCurrency(context.raw);
                        }
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    grid: {
                        display: false
                    },
                    ticks: {
                        maxTicksLimit: 7,
                        color: '#555555'
                    }
                },
                y: {
                    display: true,
                    position: 'right',
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        maxTicksLimit: 5,
                        color: '#555555',
                        callback: function (value) {
                            return FinanzUtils.formatCompact(value);
                        }
                    }
                }
            }
        }
    });
}

// ===== GRÁFICA DE DONUT PARA CATEGORÍAS =====
function createCategoryChart(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    const existingChart = Chart.getChart(ctx);
    if (existingChart) {
        existingChart.destroy();
    }

    const colors = [
        '#FF9800', // food
        '#2196F3', // transport
        '#E91E63', // shopping
        '#9C27B0', // entertainment
        '#4CAF50', // health
        '#F44336', // bills
        '#00BCD4', // education
        '#888888'  // other
    ];

    return new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: data.labels,
            datasets: [{
                data: data.data,
                backgroundColor: colors.slice(0, data.data.length),
                borderColor: '#0A0A0A',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: '#1A1A1A',
                    titleColor: '#FFFFFF',
                    bodyColor: '#FFFFFF',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1,
                    padding: 12,
                    callbacks: {
                        label: function (context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = Math.round((context.raw / total) * 100);
                            return `${context.label}: ${FinanzUtils.formatCurrency(context.raw)} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

// ===== GRÁFICA DE PRESUPUESTO (GAUGE) =====
function createBudgetChart(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    const existingChart = Chart.getChart(ctx);
    if (existingChart) {
        existingChart.destroy();
    }

    const { budget, spent } = data;
    const remaining = Math.max(0, budget - spent);
    const percent = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
    const overBudget = spent > budget;

    const color = overBudget ? '#FF4444' : '#CAFD0A';

    return new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Gastado', 'Restante'],
            datasets: [{
                data: [spent, remaining],
                backgroundColor: [color, 'rgba(255, 255, 255, 0.05)'],
                borderColor: '#0A0A0A',
                borderWidth: 2,
                circumference: 180,
                rotation: 270
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '80%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return `${context.label}: ${FinanzUtils.formatCurrency(context.raw)}`;
                        }
                    }
                }
            }
        },
        plugins: [{
            id: 'centerText',
            afterDraw: function (chart) {
                const { ctx, chartArea: { left, right, top, bottom } } = chart;
                ctx.save();
                ctx.font = 'bold 24px Inter';
                ctx.fillStyle = '#FFFFFF';
                ctx.textAlign = 'center';
                ctx.fillText(`${percent}%`, (left + right) / 2, (top + bottom) / 2 + 10);
                ctx.font = '12px Inter';
                ctx.fillStyle = '#888888';
                ctx.fillText('USADO', (left + right) / 2, (top + bottom) / 2 + 30);
                ctx.restore();
            }
        }]
    });
}
function createSparkline(canvasId, data, color = '#CAFD0A') {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    const existingChart = Chart.getChart(ctx);
    if (existingChart) {
        existingChart.destroy();
    }

    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [{
                data: data.data,
                borderColor: color,
                borderWidth: 2,
                fill: false,
                tension: 0.4,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    enabled: false
                }
            },
            scales: {
                x: {
                    display: false
                },
                y: {
                    display: false
                }
            }
        }
    });
}

// Exportar funciones
window.FinanzCharts = {
    createExpenseChart,
    createIncomeChart,
    createCategoryChart,
    createBudgetChart,
    createSparkline
};
