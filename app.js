/**
 * Elección del Plato Metrópoli - El Alto
 * Gobierno Autónomo Municipal de El Alto (GAMEA)
 * Lógica principal de votación conectada a Base de Datos en Tiempo Real
 */

// Lista de respaldo en caso de funcionamiento sin conexión o estático
const DEFAULT_DISHES = [
    {
        id: 'fiambre',
        name: 'Fiambre',
        description: 'Tradicional plato alteño, con asado, queso frito, huevo duro, fideo y papa.',
        image: 'assets/fiambre.jpg',
        votes: 10
    },
    {
        id: 'aji-fideo',
        name: 'Ají de Fideo con Chuño',
        description: 'Delicioso fideo tostado bañado en ají colorado, acompañado de chuño y carne.',
        image: 'assets/aji-fideo.jpg',
        votes: 9
    },
    {
        id: 'apthapi',
        name: 'Apthapi Andino',
        description: 'Comida comunitaria ancestral con papa, chuño, habas, queso, huevo y carnes variadas.',
        image: 'assets/apthapi.jpg',
        votes: 10
    },
    {
        id: 'wallake',
        name: 'Wallake',
        description: 'Caldo de pescado karachi con ají amarillo, papa, chuño y muña.',
        image: 'assets/wallake.jpg',
        votes: 8
    },
    {
        id: 'pesque',
        name: 'Pesque de Quinua',
        description: 'Nutritivo puré de quinua real preparado con leche y abundante queso.',
        image: 'assets/pesque.jpg',
        votes: 7
    },
    {
        id: 'sopa-fideo',
        name: 'Sopita de Fideo',
        description: 'Clásica y reconfortante sopa con carne, verduras y fideo tostado. La "sajra hora".',
        image: 'assets/sopa-fideo.jpg',
        votes: 9
    }
];

// Opciones de Distritos de El Alto y procedencia
const DISTRICT_OPTIONS = [
    { id: 'D1', label: 'Distrito 1', sub: 'Satélite / Tejada' },
    { id: 'D2', label: 'Distrito 2', sub: 'Villa Dolores / Bolívar' },
    { id: 'D3', label: 'Distrito 3', sub: 'Villa Adela / Cosmos 79' },
    { id: 'D4', label: 'Distrito 4', sub: 'Río Seco / Yunguyo' },
    { id: 'D5', label: 'Distrito 5', sub: 'Huayna Potosí' },
    { id: 'D6', label: 'Distrito 6', sub: '16 de Julio / Ballivián' },
    { id: 'D7', label: 'Distrito 7', sub: 'San Roque' },
    { id: 'D8', label: 'Distrito 8', sub: 'Senkata / Tarapacá' },
    { id: 'D9', label: 'Distrito 9', sub: 'Pomamaya' },
    { id: 'D10', label: 'Distrito 10', sub: 'Amachuma' },
    { id: 'D11', label: 'Distrito 11', sub: 'San Pedro de Curva' },
    { id: 'D12', label: 'Distrito 12', sub: 'Alto Chijini' },
    { id: 'D13', label: 'Distrito 13', sub: 'Charapaqui' },
    { id: 'D14', label: 'Distrito 14', sub: 'Bautista Saavedra' },
    { id: 'LPZ', label: 'Ciudad de La Paz', sub: 'Centro / Sur / Laderas' },
    { id: 'BOL', label: 'Otra Ciudad de Bolivia', sub: 'Cbb / Scz / Oruro / etc.' },
    { id: 'EXT', label: 'Fuera del País', sub: 'Residentes en el exterior' }
];

// Helpers de Cookies seguras para WebView (TikTok / Facebook)
function getCookie(name) {
    try {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
    } catch {}
    return null;
}

function setCookie(name, value, days = 90) {
    try {
        const d = new Date();
        d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
        document.cookie = `${name}=${value};expires=${d.toUTCString()};path=/;SameSite=Lax`;
    } catch {}
}

// Identificador único y resiliente de votante (persiste en LocalStorage y Cookies)
function getOrCreateVoterUuid() {
    let uuid = null;
    try {
        uuid = localStorage.getItem('gamea_voter_uuid');
    } catch {}
    if (!uuid) {
        uuid = getCookie('gamea_voter_uuid');
    }
    if (!uuid) {
        uuid = 'voter_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 10);
    }
    try {
        localStorage.setItem('gamea_voter_uuid', uuid);
    } catch {}
    setCookie('gamea_voter_uuid', uuid, 90);
    return uuid;
}
const voterUuid = getOrCreateVoterUuid();

// =============================================================================
// GESTOR DE COLA DE VOTOS OFFLINE RESILIENTE (SDD-05) - CERO PÉRDIDA DE VOTOS
// =============================================================================
const PENDING_VOTES_KEY = 'gamea_pending_votes';

function getPendingVotesQueue() {
    try {
        return JSON.parse(localStorage.getItem(PENDING_VOTES_KEY) || '[]');
    } catch {
        return [];
    }
}

function savePendingVotesQueue(queue) {
    try {
        localStorage.setItem(PENDING_VOTES_KEY, JSON.stringify(queue));
    } catch (e) {
        console.warn('No se pudo guardar la cola offline:', e);
    }
}

function enqueuePendingVote(votePayload) {
    const queue = getPendingVotesQueue();
    const exists = queue.some(item => item.dishId === votePayload.dishId);
    if (!exists) {
        queue.push({
            id: 'pend_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
            ...votePayload,
            timestamp: Date.now(),
            attempts: 0
        });
        savePendingVotesQueue(queue);
    }
}

let isSyncingQueue = false;
async function processPendingVotesQueue() {
    if (isSyncingQueue || !navigator.onLine) return;
    const queue = getPendingVotesQueue();
    if (queue.length === 0) return;

    isSyncingQueue = true;
    const remaining = [];

    for (const item of queue) {
        try {
            item.attempts = (item.attempts || 0) + 1;
            const res = await fetch('/api/vote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dishId: item.dishId,
                    district: item.district,
                    city: item.city,
                    voterUuid: item.voterUuid,
                    hp_field: ''
                })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                hasVotedMap[item.dishId] = true;
                localStorage.setItem('gamea_voted_dishes', JSON.stringify(hasVotedMap));
                updateCardAfterVote(item.dishId, data.newVotes);
                showToast(`✅ Voto sincronizado: Apoyo confirmado para "${data.dishName}"`, 'success');
            } else if (data && data.error && data.error.includes('Ya has emitido')) {
                // Ya estaba confirmado en servidor
                hasVotedMap[item.dishId] = true;
                localStorage.setItem('gamea_voted_dishes', JSON.stringify(hasVotedMap));
            } else if (item.attempts < 5) {
                remaining.push(item);
            }
        } catch {
            remaining.push(item);
        }
    }

    savePendingVotesQueue(remaining);
    isSyncingQueue = false;
}

// Estado de la aplicación
let dishes = [...DEFAULT_DISHES];
let selectedDishForVote = null;
let selectedDistrict = localStorage.getItem('gamea_last_district') || 'Distrito 1 (Ciudad Satélite / Tejada)';
let hasVotedMap = JSON.parse(localStorage.getItem('gamea_voted_dishes') || '{}');

// Clientes y temporizadores de sincronización
let sseSource = null;
let pollFallbackTimer = null;

// Elementos del DOM
const grid = document.getElementById('dishes-grid');
const ranking = document.getElementById('ranking-container');
const modalBackdrop = document.getElementById('district-modal');
const modalCloseBtn = document.getElementById('modal-close-btn');
const btnModalCancel = document.getElementById('btn-modal-cancel');
const btnModalConfirm = document.getElementById('btn-modal-confirm');
const modalDishPreview = document.getElementById('modal-dish-preview');
const districtGrid = document.getElementById('district-grid');
const toastContainer = document.getElementById('toast-container');

// Inicialización de la aplicación
async function init() {
    initCountdown();
    renderDistrictGrid();
    setupModalEvents();

    // 1. Carga inicial rápida de datos
    await fetchLiveDishes();

    // 2. Conexión en vivo por Server-Sent Events (SSE)
    connectRealtimeStream();

    // 3. Procesar cola de votos offline si hubiera votos guardados localmente
    processPendingVotesQueue();
    window.addEventListener('online', processPendingVotesQueue);
    setInterval(processPendingVotesQueue, 20000);
}

// Conexión en tiempo real por Server-Sent Events (SSE)
function connectRealtimeStream() {
    if (!('EventSource' in window)) {
        startPollingFallback();
        return;
    }

    try {
        if (sseSource) sseSource.close();
        sseSource = new EventSource('/api/stream');

        // Estado inicial al conectar
        sseSource.addEventListener('init', (e) => {
            try {
                const data = JSON.parse(e.data);
                if (data && Array.isArray(data.dishes)) {
                    dishes = data.dishes;
                    renderDishes();
                    renderRanking();
                }
            } catch (err) {
                console.error('Error parseando init SSE:', err);
            }
        });

        // Actualización instantánea cuando cualquier ciudadano vota
        sseSource.addEventListener('vote_update', (e) => {
            try {
                const data = JSON.parse(e.data);
                if (!data) return;

                const targetDish = dishes.find(d => d.id === data.dishId);
                if (targetDish) {
                    targetDish.votes = data.newVotes;
                    animateVoteChange(data.dishId, data.newVotes);
                }

                if (data.ranking && Array.isArray(data.ranking.dishes)) {
                    dishes = data.ranking.dishes;
                }

                renderRanking();
            } catch (err) {
                console.error('Error procesando vote_update SSE:', err);
            }
        });

        sseSource.onerror = () => {
            // Reintento silencioso con fallback a polling si hay corte de red
            if (sseSource) sseSource.close();
            sseSource = null;
            startPollingFallback();
            setTimeout(connectRealtimeStream, 8000);
        };
    } catch {
        startPollingFallback();
    }
}

function startPollingFallback() {
    if (pollFallbackTimer) return;
    pollFallbackTimer = setInterval(fetchLiveDishes, 10000);
}

// Obtener platos y votos reales desde la API
async function fetchLiveDishes() {
    try {
        const response = await fetch('/api/dishes', { cache: 'no-store' });
        if (!response.ok) throw new Error('Error al conectar con el servidor');
        const data = await response.json();
        if (data.success && Array.isArray(data.dishes) && data.dishes.length > 0) {
            dishes = data.dishes;
            renderDishes();
            renderRanking();
        }
    } catch (err) {
        // En caso de que no haya servidor o esté offline, renderiza con datos locales sin romper la app
        console.warn('Usando almacenamiento local de contingencia:', err.message);
        renderDishes();
        renderRanking();
    }
}

// Cuenta regresiva al 16 de octubre de 2026 (Gran revelación en Café Urvas)
function initCountdown() {
    // 16 de octubre a las 10:00:00 (Mes 9 en JS Date es Octubre)
    const target = new Date(2026, 9, 16, 10, 0, 0).getTime();

    const daysEl = document.getElementById('days');
    const hoursEl = document.getElementById('hours');
    const minutesEl = document.getElementById('minutes');
    const secondsEl = document.getElementById('seconds');

    if (!daysEl || !hoursEl || !minutesEl || !secondsEl) return;

    function updateTimer() {
        const now = Date.now();
        const diff = target - now;

        if (diff <= 0) {
            daysEl.textContent = '00';
            hoursEl.textContent = '00';
            minutesEl.textContent = '00';
            secondsEl.textContent = '00';
            const badge = document.querySelector('.sticky-badge') || document.querySelector('.countdown-badge');
            if (badge) {
                badge.innerHTML = '🏁 ¡ELECCIÓN FINALIZADA!';
                badge.classList.add('badge-completed');
            }
            return;
        }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        daysEl.textContent = String(days).padStart(2, '0');
        hoursEl.textContent = String(hours).padStart(2, '0');
        minutesEl.textContent = String(minutes).padStart(2, '0');
        secondsEl.textContent = String(seconds).padStart(2, '0');
    }

    updateTimer();
    setInterval(updateTimer, 1000);
}

// Renderizar tarjetas de platos
function renderDishes() {
    if (!grid) return;
    grid.innerHTML = '';

    dishes.forEach(dish => {
        const alreadyVoted = Boolean(hasVotedMap[dish.id]);
        const card = document.createElement('div');
        card.className = `dish-card ${alreadyVoted ? 'card-voted' : ''}`;
        card.setAttribute('data-dish-id', dish.id);

        card.innerHTML = `
            <div class="dish-image-wrapper">
                <img src="${dish.image}" alt="${dish.name}" class="dish-image" loading="lazy">
                ${alreadyVoted ? '<div class="voted-ribbon">✓ Votado</div>' : ''}
            </div>
            <div class="dish-content">
                <h3 class="dish-title">${dish.name}</h3>
                <p class="dish-desc">${dish.description}</p>
                <div class="dish-actions">
                    <button class="btn-vote ${alreadyVoted ? 'btn-voted' : ''}" 
                            id="btn-vote-${dish.id}"
                            onclick="handleVoteClick('${dish.id}', event)">
                        <span>${alreadyVoted ? '✓ Apoyado' : '👍 Me Gusta'}</span>
                    </button>
                    <div class="vote-count-container">
                        <div class="vote-count" id="count-${dish.id}">
                            ${dish.votes}
                        </div>
                        <div class="vote-count-change" id="change-${dish.id}">+1</div>
                    </div>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

// Renderizar ranking con podio y colores oficiales GAMEA
function renderRanking() {
    if (!ranking) return;
    ranking.innerHTML = '';

    // Ordenar de mayor a menor votos
    const sortedDishes = [...dishes].sort((a, b) => b.votes - a.votes);
    const maxVotes = Math.max(1, sortedDishes[0]?.votes || 1);
    const totalVotes = sortedDishes.reduce((acc, d) => acc + d.votes, 0);

    // Metadatos de posiciones y podio GAMEA
    const podiumConfig = [
        { classSuffix: '1', medal: '🥇', label: '1° Lugar' },
        { classSuffix: '2', medal: '🥈', label: '2° Lugar' },
        { classSuffix: '3', medal: '🥉', label: '3° Lugar' }
    ];

    sortedDishes.forEach((dish, index) => {
        const item = document.createElement('div');
        const posNumber = index + 1;
        const config = podiumConfig[index] || { classSuffix: 'other', medal: `${posNumber}°`, label: `${posNumber}° Lugar` };

        item.className = `ranking-item rank-pos-${config.classSuffix}`;

        const widthPercentage = Math.max(8, (dish.votes / maxVotes) * 100);
        const percentOfTotal = totalVotes > 0 ? ((dish.votes / totalVotes) * 100).toFixed(1) : 0;

        item.innerHTML = `
            <div class="rank-badge rank-badge-${config.classSuffix}" title="${config.label}">
                <span class="rank-medal">${config.medal}</span>
            </div>
            <div class="rank-name" title="${dish.name}">
                <span>${dish.name}</span>
            </div>
            <div class="rank-bar-container">
                <div class="rank-bar bar-${config.classSuffix}" style="width: ${widthPercentage}%"></div>
            </div>
            <div class="rank-votes-container">
                <span class="rank-percentage">${percentOfTotal}%</span>
                <span class="rank-votes" id="rank-val-${dish.id}">${dish.votes}</span>
                <span class="rank-votes-label">votos</span>
            </div>
        `;
        ranking.appendChild(item);
    });
}

// Configurar modal de distritos
function renderDistrictGrid() {
    if (!districtGrid) return;
    districtGrid.innerHTML = '';

    DISTRICT_OPTIONS.forEach(opt => {
        const fullDistrictName = `${opt.label} (${opt.sub})`;
        const isSelected = selectedDistrict.startsWith(opt.label);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `district-pill ${isSelected ? 'selected' : ''}`;
        btn.setAttribute('data-full-name', fullDistrictName);
        btn.innerHTML = `
            <span class="pill-title">${opt.label}</span>
            <span class="pill-sub">${opt.sub}</span>
        `;

        btn.addEventListener('click', () => {
            document.querySelectorAll('.district-pill').forEach(p => p.classList.remove('selected'));
            btn.classList.add('selected');
            selectedDistrict = fullDistrictName;
            localStorage.setItem('gamea_last_district', fullDistrictName);
        });

        districtGrid.appendChild(btn);
    });
}

// Eventos de apertura y cierre del modal
function setupModalEvents() {
    if (!modalBackdrop) return;

    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
    if (btnModalCancel) btnModalCancel.addEventListener('click', closeModal);

    modalBackdrop.addEventListener('click', (e) => {
        if (e.target === modalBackdrop) closeModal();
    });

    if (btnModalConfirm) {
        btnModalConfirm.addEventListener('click', submitVote);
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modalBackdrop.classList.contains('active')) {
            closeModal();
        }
    });
}

function openDistrictModal(dishId) {
    const dish = dishes.find(d => d.id === dishId);
    if (!dish || !modalBackdrop) return;

    selectedDishForVote = dish;

    // Actualizar vista previa en el modal
    if (modalDishPreview) {
        modalDishPreview.innerHTML = `
            <img src="${dish.image}" alt="${dish.name}" class="modal-dish-img">
            <div class="modal-dish-info">
                <h4 class="modal-dish-name">${dish.name}</h4>
                <p class="modal-dish-tag">Plato Candidato Oficial de El Alto</p>
            </div>
        `;
    }

    modalBackdrop.classList.add('active');
    modalBackdrop.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    if (!modalBackdrop) return;
    modalBackdrop.classList.remove('active');
    modalBackdrop.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    selectedDishForVote = null;
}

// Manejar clic en botón de votar de la tarjeta
function handleVoteClick(dishId, event) {
    if (event) {
        const btn = event.currentTarget;
        btn.style.transform = 'scale(0.95)';
        setTimeout(() => { btn.style.transform = ''; }, 150);
    }

    // Si ya votó por este plato, informar al usuario
    if (hasVotedMap[dishId]) {
        showToast(`Ya has emitido tu voto por ${dishes.find(d => d.id === dishId)?.name || 'este plato'}. ¡Gracias por apoyar!`, 'info');
        return;
    }

    openDistrictModal(dishId);
}

// Enviar voto oficial a la Base de Datos
async function submitVote() {
    if (!selectedDishForVote) return;

    const dishId = selectedDishForVote.id;
    const dishName = selectedDishForVote.name;
    const district = selectedDistrict || 'Distrito 1 (Ciudad Satélite / Tejada)';

    // Bloquear botón durante el envío
    if (btnModalConfirm) {
        btnModalConfirm.disabled = true;
        btnModalConfirm.innerHTML = '<span>⏳ Registrando voto...</span>';
    }

    try {
        const hpVal = document.getElementById('hp-field')?.value || '';
        const response = await fetch('/api/vote', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                dishId,
                district,
                city: district.includes('La Paz') ? 'La Paz' : (district.includes('Otra') ? 'Interior' : 'El Alto'),
                voterUuid,
                hp_field: hpVal
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            // Actualizar votos en memoria local
            const targetDish = dishes.find(d => d.id === dishId);
            if (targetDish) {
                targetDish.votes = data.newVotes;
            }

            // Marcar plato como votado en localStorage
            hasVotedMap[dishId] = true;
            localStorage.setItem('gamea_voted_dishes', JSON.stringify(hasVotedMap));

            // Actualizar tarjeta y contador visual
            updateCardAfterVote(dishId, data.newVotes);
            renderRanking();

            closeModal();
            showToast(`¡Voto registrado con éxito! Apoyaste a "${dishName}" desde ${district.split('(')[0].trim()}.`, 'success');
        } else {
            showToast(data.error || 'No se pudo registrar el voto en este momento.', 'error');
        }
    } catch (err) {
        console.warn('Fallo de red al registrar voto. Encolando offline:', err);

        // SDD-05: Garantía de persistencia offline (cero votos perdidos en tránsito)
        const city = district.includes('La Paz') ? 'La Paz' : (district.includes('Otra') ? 'Interior' : 'El Alto');
        enqueuePendingVote({ dishId, district, city, voterUuid });

        hasVotedMap[dishId] = true;
        try {
            localStorage.setItem('gamea_voted_dishes', JSON.stringify(hasVotedMap));
        } catch {}

        const targetDish = dishes.find(d => d.id === dishId);
        const estVotes = (targetDish?.votes || 0) + 1;
        if (targetDish) targetDish.votes = estVotes;
        updateCardAfterVote(dishId, estVotes);

        closeModal();
        showToast('📡 Conexión inestable: Voto guardado en tu dispositivo. Se enviará automáticamente cuando regrese internet.', 'info');
    } finally {
        if (btnModalConfirm) {
            btnModalConfirm.disabled = false;
            btnModalConfirm.innerHTML = '<span>👍 Confirmar Mi Voto</span>';
        }
    }
}

// Animación de incremento de votos en tiempo real por SSE
function animateVoteChange(dishId, newCount) {
    const countEl = document.getElementById(`count-${dishId}`);
    if (countEl) {
        countEl.textContent = newCount;
        const changeEl = document.getElementById(`change-${dishId}`);
        if (changeEl) {
            changeEl.classList.remove('active');
            void changeEl.offsetWidth; // trigger reflow
            changeEl.classList.add('active');
        }
    }
}

// Actualizar tarjeta después del voto con animación
function updateCardAfterVote(dishId, newCount) {
    animateVoteChange(dishId, newCount);

    const voteBtn = document.getElementById(`btn-vote-${dishId}`);
    if (voteBtn) {
        voteBtn.classList.add('btn-voted');
        voteBtn.innerHTML = '<span>✓ Apoyado</span>';
    }

    const card = document.querySelector(`.dish-card[data-dish-id="${dishId}"]`);
    if (card) {
        card.classList.add('card-voted');
        const imgWrapper = card.querySelector('.dish-image-wrapper');
        if (imgWrapper && !imgWrapper.querySelector('.voted-ribbon')) {
            const ribbon = document.createElement('div');
            ribbon.className = 'voted-ribbon';
            ribbon.textContent = '✓ Votado';
            imgWrapper.appendChild(ribbon);
        }
    }
}

// Notificaciones Toast elegantes
function showToast(message, type = 'success') {
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `gamea-toast toast-${type}`;

    const icon = type === 'success' ? '✅' : (type === 'error' ? '⚠️' : 'ℹ️');

    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-msg">${message}</span>
    `;

    toastContainer.appendChild(toast);

    // Animación de entrada
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    // Desaparecer después de 4.5 segundos
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
    }, 4500);
}

// Iniciar app al cargar el DOM
document.addEventListener('DOMContentLoaded', init);
