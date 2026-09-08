// Datos de los platos
const dishes = [
    {
        id: 'fiambre',
        name: 'Fiambre',
        description: 'Tradicional plato paceño y alteño, con asado, salchicha, queso frito, huevo, fideo y papa.',
        image: 'assets/fiambre.jpg',
        votes: 10
    },
    {
        id: 'aji-fideo',
        name: 'Ají de Fideo con Chuño',
        description: 'Delicioso fideo tostado bañado en ají colorado, acompañado de chuño y carne.',
        image: 'assets/aji-fideo.jpg',
        votes: 90
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
        votes: 80
    },
    {
        id: 'pesque',
        name: 'Pesque de Quinua',
        description: 'Nutritivo puré de quinua real preparado con leche y abundante queso.',
        image: 'assets/pesque.jpg',
        votes: 70
    },
    {
        id: 'sopa-fideo',
        name: 'Sopita de Fideo',
        description: 'Clásica y reconfortante sopa con carne, verduras y fideo tostado. La "sajra hora".',
        image: 'assets/sopa-fideo.jpg',
        votes: 90
    }
];

// Elementos del DOM
const grid = document.getElementById('dishes-grid');
const ranking = document.getElementById('ranking-container');

// Inicialización
function init() {
    initCountdown();
    renderDishes();
    renderRanking();
}

// Cuenta regresiva al 15 de octubre (Cierre de votación)
function initCountdown() {
    const currentYear = new Date().getFullYear();
    // 15 de octubre a las 23:59:59 (mes 9 en JavaScript Date es Octubre)
    let target = new Date(currentYear, 9, 15, 23, 59, 59).getTime();

    if (Date.now() > target) {
        target = new Date(currentYear + 1, 9, 15, 23, 59, 59).getTime();
    }

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
                badge.innerHTML = '🏁 ¡VOTACIÓN FINALIZADA!';
                badge.style.background = 'rgba(16, 185, 129, 0.2)';
                badge.style.borderColor = 'rgba(16, 185, 129, 0.4)';
                badge.style.color = '#34d399';
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
    grid.innerHTML = '';
    dishes.forEach(dish => {
        const card = document.createElement('div');
        card.className = 'dish-card';
        card.innerHTML = `
            <div class="dish-image-wrapper">
                <img src="${dish.image}" alt="${dish.name}" class="dish-image">
            </div>
            <div class="dish-content">
                <h3 class="dish-title">${dish.name}</h3>
                <p class="dish-desc">${dish.description}</p>
                <div class="dish-actions">
                    <button class="btn-vote" onclick="vote('${dish.id}', event)">Votar</button>
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

// Renderizar ranking
function renderRanking() {
    ranking.innerHTML = '';

    // Ordenar de mayor a menor
    const sortedDishes = [...dishes].sort((a, b) => b.votes - a.votes);
    const maxVotes = sortedDishes[0]?.votes || 1; // Prevenir división por 0

    sortedDishes.forEach((dish, index) => {
        const item = document.createElement('div');
        item.className = 'ranking-item';

        const isFirst = index === 0;
        const widthPercentage = (dish.votes / maxVotes) * 100;

        item.innerHTML = `
            <div class="rank-name">${dish.name}</div>
            <div class="rank-bar-container">
                <div class="rank-bar ${isFirst ? 'first-place' : ''}" style="width: ${widthPercentage}%"></div>
            </div>
            <div class="rank-votes" id="rank-val-${dish.id}">${dish.votes}</div>
        `;
        ranking.appendChild(item);
    });
}

// Función de votación (Simulación de tiempo real)
function vote(dishId, event) {
    const dish = dishes.find(d => d.id === dishId);
    if (!dish) return;

    // Incrementar votos
    dish.votes += 1;

    // Actualizar contador en la tarjeta
    const countEl = document.getElementById(`count-${dishId}`);
    if (countEl) {
        countEl.textContent = dish.votes;

        // Animación de +1
        const changeEl = document.getElementById(`change-${dishId}`);
        if (changeEl) {
            changeEl.classList.remove('active');
            void changeEl.offsetWidth; // trigger reflow
            changeEl.classList.add('active');
        }
    }

    // Efecto ripple en el botón clickeado
    if (event) {
        const btn = event.currentTarget;
        btn.style.transform = 'scale(0.95)';
        setTimeout(() => {
            btn.style.transform = '';
        }, 150);
    }

    // Actualizar ranking
    renderRanking();
}

// Simular votaciones aleatorias de otros usuarios (Real-time effect)
setInterval(() => {
    // 30% de probabilidad de que ocurra un voto aleatorio cada 2 segundos
    if (Math.random() < 0.3) {
        const randomIndex = Math.floor(Math.random() * dishes.length);
        const randomDish = dishes[randomIndex];
        vote(randomDish.id, null);
    }
}, 2000);

// Iniciar app
document.addEventListener('DOMContentLoaded', init);
