/**
 * Lógica del Dashboard Oficial de Votación
 * Gobierno Autónomo Municipal de El Alto (GAMEA)
 * Monitoreo en Tiempo Real y Gráficos Interactivos
 */

// Paleta Oficial GAMEA para Chart.js
const GAMEA_COLORS = [
    '#ed2986', // Magenta
    '#f4b129', // Amarillo Andino
    '#10928b', // Teal / Verde Azulado
    '#6a4ec7', // Morado Institucional
    '#16b3aa', // Teal Claro
    '#d99616', // Oro Oscuro
    '#b8125f', // Magenta Oscuro
    '#38bdf8', // Celeste
    '#fb923c', // Naranja
    '#4ade80'  // Verde
];

// Instancias de Chart.js
let chartDishesInstance = null;
let chartTimelineInstance = null;
let chartDistrictsInstance = null;
let chartDevicesInstance = null;
let chartHourlyInstance = null;

// Elementos del DOM
const kpiTotalVotes = document.getElementById('kpi-total-votes');
const kpiLast24h = document.getElementById('kpi-last24h');
const kpiLeaderName = document.getElementById('kpi-leader-name');
const kpiLeaderStat = document.getElementById('kpi-leader-stat');
const kpiTopDistrict = document.getElementById('kpi-top-district');
const kpiDistrictStat = document.getElementById('kpi-district-stat');
const kpiMobilePct = document.getElementById('kpi-mobile-pct');
const kpiMobileStat = document.getElementById('kpi-mobile-stat');
const votesTbody = document.getElementById('votes-tbody');
const btnRefresh = document.getElementById('btn-refresh');
const refreshIcon = document.getElementById('refresh-icon');

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    loadDashboardData();

    // Actualización manual al pulsar el botón
    if (btnRefresh) {
        btnRefresh.addEventListener('click', () => {
            triggerManualRefresh();
        });
    }

    // Auto-actualización silenciosa en tiempo real cada 10 segundos
    setInterval(loadDashboardData, 10000);
});

// Animación del botón de refresco
function triggerManualRefresh() {
    if (refreshIcon) {
        refreshIcon.style.transition = 'transform 0.5s ease';
        refreshIcon.style.transform = 'rotate(360deg)';
        setTimeout(() => {
            refreshIcon.style.transition = 'none';
            refreshIcon.style.transform = 'none';
        }, 500);
    }
    loadDashboardData();
}

// Cargar todos los datos del dashboard desde los endpoints de la API
async function loadDashboardData() {
    try {
        const [statsRes, recentRes] = await Promise.all([
            fetch('/api/dashboard/stats', { cache: 'no-store' }),
            fetch('/api/dashboard/recent-votes?limit=50', { cache: 'no-store' })
        ]);

        if (statsRes.ok) {
            const statsData = await statsRes.json();
            if (statsData.success && statsData.stats) {
                renderKpis(statsData.stats);
                renderCharts(statsData.stats);
            }
        }

        if (recentRes.ok) {
            const recentData = await recentRes.json();
            if (recentData.success && Array.isArray(recentData.votes)) {
                renderRecentVotesTable(recentData.votes);
            }
        }
    } catch (err) {
        console.error('Error al cargar datos del dashboard:', err);
    }
}

// Renderizar tarjetas KPI ejecutivas
function renderKpis(stats) {
    if (kpiTotalVotes) kpiTotalVotes.textContent = stats.totalVotes.toLocaleString();
    if (kpiLast24h) kpiLast24h.textContent = `+${stats.last24hVotes} votos en las últimas 24 horas`;

    if (stats.leader) {
        if (kpiLeaderName) kpiLeaderName.textContent = stats.leader.name;
        if (kpiLeaderStat) kpiLeaderStat.textContent = `${stats.leader.votes} votos (${stats.leader.percentage}% del total)`;
    } else {
        if (kpiLeaderName) kpiLeaderName.textContent = 'Sin votos';
        if (kpiLeaderStat) kpiLeaderStat.textContent = '0 votos';
    }

    if (kpiTopDistrict) {
        kpiTopDistrict.textContent = stats.topDistrict;
        kpiTopDistrict.title = stats.topDistrict;
    }
    if (kpiDistrictStat) {
        const topDistData = stats.districtVotes.find(d => d.district === stats.topDistrict);
        if (topDistData) {
            kpiDistrictStat.textContent = `${topDistData.votes} votos emitidos (${topDistData.percentage}%)`;
        }
    }

    // Estadísticas de móvil
    const mobileData = stats.deviceVotes.find(d => d.device === 'Móvil');
    const mobilePct = mobileData ? mobileData.percentage : 0;
    const mobileCount = mobileData ? mobileData.votes : 0;
    if (kpiMobilePct) kpiMobilePct.textContent = `${mobilePct}%`;
    if (kpiMobileStat) kpiMobileStat.textContent = `${mobileCount} votos desde smartphones`;
}

// Renderizar o actualizar los gráficos con Chart.js
function renderCharts(stats) {
    if (typeof Chart === 'undefined') return;

    // Configuración general de estilo oscuro y tipografía
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = "'Inter', sans-serif";

    renderDishesChart(stats.dishesVotes);
    renderTimelineChart(stats.activityTimeline);
    renderDistrictsChart(stats.districtVotes);
    renderDevicesChart(stats.deviceVotes);
    renderHourlyChart(stats.hourlyActivity);
}

// 1. Gráfico de Votos por Plato (Dona con colores GAMEA)
function renderDishesChart(dishesVotes) {
    const ctx = document.getElementById('chart-dishes');
    if (!ctx) return;

    const labels = dishesVotes.map(d => d.name);
    const data = dishesVotes.map(d => d.votes);

    if (chartDishesInstance) {
        chartDishesInstance.data.labels = labels;
        chartDishesInstance.data.datasets[0].data = data;
        chartDishesInstance.update();
        return;
    }

    chartDishesInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: GAMEA_COLORS.slice(0, dishesVotes.length),
                borderColor: '#0f172a',
                borderWidth: 2,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        boxWidth: 14,
                        padding: 12,
                        font: { size: 12 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const val = context.raw || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                            return ` ${context.label}: ${val} votos (${pct}%)`;
                        }
                    }
                }
            },
            cutout: '65%'
        }
    });
}

// 2. Gráfico de Actividad en el Tiempo (Línea de tendencia)
function renderTimelineChart(timeline) {
    const ctx = document.getElementById('chart-timeline');
    if (!ctx) return;

    const labels = timeline.map(t => {
        const parts = t.date.split('-');
        return `${parts[2]}/${parts[1]}`;
    });
    const data = timeline.map(t => t.count);

    if (chartTimelineInstance) {
        chartTimelineInstance.data.labels = labels;
        chartTimelineInstance.data.datasets[0].data = data;
        chartTimelineInstance.update();
        return;
    }

    chartTimelineInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Votos Registrados',
                data,
                borderColor: '#ed2986',
                backgroundColor: 'rgba(237, 41, 134, 0.15)',
                borderWidth: 3,
                fill: true,
                tension: 0.35,
                pointBackgroundColor: '#f4b129',
                pointBorderColor: '#ffffff',
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { precision: 0 },
                    grid: { color: 'rgba(255, 255, 255, 0.06)' }
                },
                x: {
                    grid: { display: false }
                }
            }
        }
    });
}

// 3. Gráfico de Votos por Distrito (Barras Horizontales)
function renderDistrictsChart(districts) {
    const ctx = document.getElementById('chart-districts');
    if (!ctx) return;

    // Acortar nombres para visualización limpia
    const labels = districts.map(d => {
        const cleaned = d.district.replace('Distrito ', 'D');
        return cleaned.length > 25 ? cleaned.substring(0, 23) + '...' : cleaned;
    });
    const data = districts.map(d => d.votes);

    if (chartDistrictsInstance) {
        chartDistrictsInstance.data.labels = labels;
        chartDistrictsInstance.data.datasets[0].data = data;
        chartDistrictsInstance.update();
        return;
    }

    chartDistrictsInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Votos',
                data,
                backgroundColor: 'rgba(16, 146, 139, 0.75)',
                borderColor: '#10928b',
                borderWidth: 1,
                borderRadius: 6,
                hoverBackgroundColor: '#16b3aa'
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: (items) => {
                            const idx = items[0].dataIndex;
                            return districts[idx]?.district || '';
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: { precision: 0 },
                    grid: { color: 'rgba(255, 255, 255, 0.06)' }
                },
                y: {
                    grid: { display: false },
                    ticks: { font: { size: 11 } }
                }
            }
        }
    });
}

// 4. Gráfico de Dispositivos (Móvil vs Escritorio)
function renderDevicesChart(devices) {
    const ctx = document.getElementById('chart-devices');
    if (!ctx) return;

    const labels = devices.map(d => d.device);
    const data = devices.map(d => d.votes);

    if (chartDevicesInstance) {
        chartDevicesInstance.data.labels = labels;
        chartDevicesInstance.data.datasets[0].data = data;
        chartDevicesInstance.update();
        return;
    }

    chartDevicesInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: ['#ed2986', '#10928b', '#f4b129'],
                borderColor: '#0f172a',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { boxWidth: 12, padding: 10 }
                }
            }
        }
    });
}

// 5. Gráfico de Actividad por Horas del Día
function renderHourlyChart(hourly) {
    const ctx = document.getElementById('chart-hourly');
    if (!ctx) return;

    // Crear vector completo de 0 a 23 horas
    const fullHours = Array.from({ length: 24 }, (_, i) => ({
        label: `${String(i).padStart(2, '0')}:00`,
        count: 0
    }));

    hourly.forEach(h => {
        if (h.hour >= 0 && h.hour < 24) {
            fullHours[h.hour].count = h.count;
        }
    });

    const labels = fullHours.map(h => h.label);
    const data = fullHours.map(h => h.count);

    if (chartHourlyInstance) {
        chartHourlyInstance.data.labels = labels;
        chartHourlyInstance.data.datasets[0].data = data;
        chartHourlyInstance.update();
        return;
    }

    chartHourlyInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Votos en esa hora',
                data,
                backgroundColor: 'rgba(244, 177, 41, 0.7)',
                borderColor: '#f4b129',
                borderWidth: 1,
                borderRadius: 4,
                hoverBackgroundColor: '#f4b129'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { precision: 0 },
                    grid: { color: 'rgba(255, 255, 255, 0.06)' }
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        font: { size: 10 },
                        maxRotation: 45,
                        autoSkip: true,
                        maxTicksLimit: 12
                    }
                }
            }
        }
    });
}

// Renderizar la tabla de últimos votos en vivo
function renderRecentVotesTable(votes) {
    if (!votesTbody) return;

    if (!votes.length) {
        votesTbody.innerHTML = `
            <tr>
                <td colspan="7" class="td-loading">Aún no se han registrado votos.</td>
            </tr>
        `;
        return;
    }

    votesTbody.innerHTML = '';

    votes.forEach(v => {
        const tr = document.createElement('tr');

        // Formateo de fecha y hora local
        let dateFormatted = v.created_at;
        try {
            const d = new Date(v.created_at);
            dateFormatted = d.toLocaleString('es-BO', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        } catch (e) {}

        const deviceClass = v.device_type === 'Móvil' ? 'mobile' : 'desktop';
        const deviceIcon = v.device_type === 'Móvil' ? '📱' : '💻';

        tr.innerHTML = `
            <td class="td-id">#${v.id}</td>
            <td>${dateFormatted}</td>
            <td class="td-dish">
                <img src="${v.dish_image}" alt="${v.dish_name}" class="td-dish-img">
                <span>${v.dish_name}</span>
            </td>
            <td class="td-district">${v.district}</td>
            <td>${v.city}</td>
            <td>
                <span class="badge-device ${deviceClass}">
                    ${deviceIcon} ${v.device_type}
                </span>
            </td>
            <td>
                <span class="badge-status-ok">
                    <span>✓</span> Registrado
                </span>
            </td>
        `;

        votesTbody.appendChild(tr);
    });
}
