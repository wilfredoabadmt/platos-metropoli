// Datos de los platos
const dishes = [
    {
        id: 'fiambre',
        name: 'Fiambre',
        description: 'Tradicional plato paceño y alteño, con asado, salchicha, queso frito, huevo, fideo y papa.',
        image: 'assets/fiambre.jpg',
        votes: 1245
    },
    {
        id: 'aji-fideo',
        name: 'Ají de Fideo con Chuño',
        description: 'Delicioso fideo tostado bañado en ají colorado, acompañado de chuño y carne.',
        image: 'assets/aji-fideo.jpg',
        votes: 980
    },
    {
        id: 'apthapi',
        name: 'Apthapi Andino',
        description: 'Comida comunitaria ancestral con papa, chuño, habas, queso, huevo y carnes variadas.',
        image: 'assets/apthapi.jpg',
        votes: 1102
    },
    {
        id: 'wallake',
        name: 'Wallake',
        description: 'Caldo de pescado karachi con ají amarillo, papa, chuño y muña.',
        image: 'assets/wallake.jpg',
        votes: 856
    },
    {
        id: 'pesque',
        name: 'Pesque de Quinua',
        description: 'Nutritivo puré de quinua real preparado con leche y abundante queso.',
        image: 'assets/pesque.jpg',
        votes: 790
    },
    {
        id: 'sopa-fideo',
        name: 'Sopita de Fideo',
        description: 'Clásica y reconfortante sopa con carne, verduras y fideo tostado. La "sajra hora".',
        image: 'assets/sopa-fideo.jpg',
        votes: 920
    }
];

// Elementos del DOM
const grid = document.getElementById('dishes-grid');
const ranking = document.getElementById('ranking-container');

// Inicialización
function init() {
    renderDishes();
    renderRanking();
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
