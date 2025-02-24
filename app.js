// State management
const state = {
    items: [],
    currentUser: null,
    filters: {
        category: '',
        sort: 'price-desc',
        search: ''
    }
};

// DOM Elements
const elements = {
    itemsContainer: document.getElementById('itemsContainer'),
    loginModal: document.getElementById('loginModal'),
    sellModal: document.getElementById('sellModal'),
    loginBtn: document.getElementById('loginBtn'),
    sellBtn: document.getElementById('sellBtn'),
    searchInput: document.getElementById('searchInput'),
    categoryFilter: document.getElementById('categoryFilter'),
    sortFilter: document.getElementById('sortFilter')
};

// API endpoints
const API = {
    BASE_URL: 'http://localhost:3000/api',
    ITEMS: '/items',
    AUTH: '/auth',
    USERS: '/users'
};

// Item class to handle price updates
class Item {
    constructor(data) {
        this.id = data.id;
        this.name = data.name;
        this.description = data.description;
        this.startPrice = data.startPrice;
        this.currentPrice = data.currentPrice;
        this.minPrice = data.minPrice;
        this.imageUrl = data.imageUrl;
        this.category = data.category;
        this.seller = data.seller;
        this.createdAt = new Date(data.createdAt);
        this.lastPriceUpdate = new Date(data.lastPriceUpdate);
    }

    updatePrice() {
        const hoursSinceUpdate = Math.floor(
            (new Date() - this.lastPriceUpdate) / (1000 * 60 * 60)
        );
        
        if (hoursSinceUpdate >= 1) {
            const priceReduction = hoursSinceUpdate;
            let newPrice = this.currentPrice - priceReduction;
            
            if (newPrice < this.minPrice) {
                // Reset price to starting price
                newPrice = this.startPrice;
            }
            
            this.currentPrice = newPrice;
            this.lastPriceUpdate = new Date();
            
            // Update item in backend
            this.savePrice();
        }
    }

    async savePrice() {
        try {
            await fetch(`${API.BASE_URL}${API.ITEMS}/${this.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getToken()}`
                },
                body: JSON.stringify({
                    currentPrice: this.currentPrice,
                    lastPriceUpdate: this.lastPriceUpdate
                })
            });
        } catch (error) {
            console.error('Error updating price:', error);
        }
    }

    render() {
        const card = document.createElement('div');
        card.className = 'item-card';
        
        this.updatePrice(); // Update price before rendering
        
        card.innerHTML = `
            <img src="${this.imageUrl}" alt="${this.name}" class="item-image">
            <div class="item-details">
                <h3>${this.name}</h3>
                <p>${this.description}</p>
                <div class="item-price">$${this.currentPrice.toFixed(2)}</div>
                <div class="price-timer">
                    Next price drop in ${this.getTimeUntilNextDrop()}
                </div>
                <button onclick="handlePurchase(${this.id})" class="nav-btn primary">
                    Buy Now
                </button>
            </div>
        `;
        
        return card;
    }

    getTimeUntilNextDrop() {
        const nextDrop = new Date(this.lastPriceUpdate);
        nextDrop.setHours(nextDrop.getHours() + 1);
        const timeLeft = nextDrop - new Date();
        const minutesLeft = Math.floor(timeLeft / (1000 * 60));
        return `${minutesLeft} minutes`;
    }
}

// Authentication
function getToken() {
    return localStorage.getItem('token');
}

async function login(email, password) {
    try {
        const response = await fetch(`${API.BASE_URL}${API.AUTH}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            localStorage.setItem('token', data.token);
            state.currentUser = data.user;
            updateUI();
            return true;
        }
        return false;
    } catch (error) {
        console.error('Login error:', error);
        return false;
    }
}

// Item Management
async function fetchItems() {
    try {
        const response = await fetch(`${API.BASE_URL}${API.ITEMS}`);
        const data = await response.json();
        state.items = data.map(item => new Item(item));
        renderItems();
    } catch (error) {
        console.error('Error fetching items:', error);
    }
}

async function createItem(itemData) {
    try {
        const formData = new FormData();
        Object.keys(itemData).forEach(key => {
            formData.append(key, itemData[key]);
        });
        
        const response = await fetch(`${API.BASE_URL}${API.ITEMS}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            },
            body: formData
        });
        
        if (response.ok) {
            await fetchItems();
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error creating item:', error);
        return false;
    }
}

// UI Rendering
function renderItems() {
    elements.itemsContainer.innerHTML = '';
    let filteredItems = filterItems();
    
    filteredItems.forEach(item => {
        elements.itemsContainer.appendChild(item.render());
    });
}

function filterItems() {
    let filtered = state.items;
    
    // Apply category filter
    if (state.filters.category) {
        filtered = filtered.filter(item => item.category === state.filters.category);
    }
    
    // Apply search filter
    if (state.filters.search) {
        const searchLower = state.filters.search.toLowerCase();
        filtered = filtered.filter(item => 
            item.name.toLowerCase().includes(searchLower) ||
            item.description.toLowerCase().includes(searchLower)
        );
    }
    
    // Apply sorting
    filtered.sort((a, b) => {
        switch (state.filters.sort) {
            case 'price-desc':
                return b.currentPrice - a.currentPrice;
            case 'price-asc':
                return a.currentPrice - b.currentPrice;
            case 'newest':
                return b.createdAt - a.createdAt;
            default:
                return 0;
        }
    });
    
    return filtered;
}

// Event Handlers
function handlePurchase(itemId) {
    if (!state.currentUser) {
        showModal(elements.loginModal);
        return;
    }
    
    // Implement purchase logic
    purchaseItem(itemId);
}

async function purchaseItem(itemId) {
    try {
        const response = await fetch(`${API.BASE_URL}${API.ITEMS}/${itemId}/purchase`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        if (response.ok) {
            alert('Purchase successful!');
            await fetchItems();
        } else {
            alert('Purchase failed. Please try again.');
        }
    } catch (error) {
        console.error('Error purchasing item:', error);
        alert('Purchase failed. Please try again.');
    }
}

// Modal Management
function showModal(modal) {
    modal.style.display = 'block';
}

function hideModal(modal) {
    modal.style.display = 'none';
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Initialize
    fetchItems();
    
    // Login button
    elements.loginBtn.addEventListener('click', () => {
        showModal(elements.loginModal);
    });
    
    // Sell button
    elements.sellBtn.addEventListener('click', () => {
        if (!state.currentUser) {
            showModal(elements.loginModal);
            return;
        }
        showModal(elements.sellModal);
    });
    
    // Search input
    elements.searchInput.addEventListener('input', (e) => {
        state.filters.search = e.target.value;
        renderItems();
    });
    
    // Category filter
    elements.categoryFilter.addEventListener('change', (e) => {
        state.filters.category = e.target.value;
        renderItems();
    });
    
    // Sort filter
    elements.sortFilter.addEventListener('change', (e) => {
        state.filters.sort = e.target.value;
        renderItems();
    });
    
    // Login form
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = e.target.elements[0].value;
        const password = e.target.elements[1].value;
        
        if (await login(email, password)) {
            hideModal(elements.loginModal);
            e.target.reset();
        } else {
            alert('Login failed. Please check your credentials.');
        }
    });
    
    // Sell form
    document.getElementById('sellForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = {
            name: e.target.elements[0].value,
            description: e.target.elements[1].value,
            startPrice: parseFloat(e.target.elements[2].value),
            minPrice: parseFloat(e.target.elements[3].value),
            category: e.target.elements[4].value,
            image: e.target.elements[5].files[0]
        };
        
        if (await createItem(formData)) {
            hideModal(elements.sellModal);
            e.target.reset();
        } else {
            alert('Failed to create item. Please try again.');
        }
    });
    
    // Close modals when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            hideModal(e.target);
        }
    });
});

// Price update interval
setInterval(() => {
    if (state.items.length > 0) {
        renderItems();
    }
}, 60000); // Check every minute
