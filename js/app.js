// --- SYSTEM STATE DATA ---
const menuData = [
    { id: 1, name: "Gourmet Jalapeño Popper Fries", price: 6.99, category: "Fries", img: "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3", desc: "Cripsy premium seasoned potato strips with warm cheese sauce & jalapeños." },
    { id: 2, name: "The Station Double Smashed Burger", price: 9.49, category: "Burgers", img: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3", desc: "Two smashed angus beef patties, cheddar cheese, secret relish on potato bun." },
    { id: 3, name: "Creamy Truffle Loaded Potato Skins", price: 8.25, category: "Snacks", img: "https://images.unsplash.com/photo-1541532713592-79a0317b6b77?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3", desc: "Crisped potato boats filled with parmesan, white truffle oil & green onion curls." },
    { id: 4, name: "Sriracha Buffalo Chicken Wings", price: 10.99, category: "Chicken", img: "https://images.unsplash.com/photo-1567620832903-9fc6debc209f?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3", desc: "Juicy jumbo wings tossed in dynamic garlic sriracha and rich buffalo marinade." },
    { id: 5, name: "Double Fudge Hot Brownie Cookie", price: 4.50, category: "Desserts", img: "https://images.unsplash.com/photo-1515037893149-de7f840978e2?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3", desc: "Warm, gooey core brownie cookie topped with premium dark chocolate drizzle." }
];

let state = {
    currentUser: null, // Track logged-in customer profile
    users: [
        { id: "U-1001", name: "Sarah Khan", email: "sarah@gmail.com", joined: "2026-05-12", orderCount: 4 },
        { id: "U-1002", name: "Usman Ahmed", email: "usman@hotmail.com", joined: "2026-06-20", orderCount: 7 }
    ],
    cart: [],
    orders: [
        { id: "ORD-9421", user: "Sarah Khan", items: "1x Double Smashed Burger, 1x Buffalo Wings", total: 22.98, status: "completed", date: "2026-07-13" },
        { id: "ORD-9422", user: "Usman Ahmed", items: "2x Jalapeño Popper Fries", total: 16.48, status: "preparing", date: "2026-07-14" }
    ],
    isLoginMode: false // Switch between Sign-up/Sign-in views
};

// --- RUN ENGINE ON INITIALIZE ---
window.addEventListener('DOMContentLoaded', () => {
    renderMenu();
    renderCart();
    renderAuthBar();
    renderOrdersTable();
    renderUsersTable();
    lucide.createIcons();
});

// --- NAVIGATION LAYOUT CONTROL ---
function switchPanel(panelId) {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById(`${panelId}-panel`).classList.add('active');
    event.currentTarget.classList.add('active');
}

// --- POP-UP NOTIFICATIONS ---
function triggerToast(message) {
    const toast = document.getElementById('toast-box');
    const toastMsg = document.getElementById('toast-message');
    toastMsg.innerText = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// --- IDENTITY & ACCOUNT MANAGEMENT ---
function toggleAuthModal(show) {
    const modal = document.getElementById('auth-modal');
    if(show) {
        modal.classList.add('active');
    } else {
        modal.classList.remove('active');
    }
}

function toggleAuthMode(toLogin) {
    state.isLoginMode = toLogin;
    const title = document.getElementById('modal-title-text');
    const toggleDesc = document.getElementById('modal-toggle-desc');
    const nameGrp = document.getElementById('username-group');

    if(toLogin) {
        title.innerText = "Welcome back to The Station";
        nameGrp.style.display = "none";
        document.getElementById('reg-username').required = false;
        toggleDesc.innerHTML = `Need an account? <span onclick="toggleAuthMode(false)">Sign Up</span>`;
    } else {
        title.innerText = "Create Your Station Profile";
        nameGrp.style.display = "block";
        document.getElementById('reg-username').required = true;
        toggleDesc.innerHTML = `Already registered? <span onclick="toggleAuthMode(true)">Sign In</span>`;
    }
}

function handleAuthSubmit(e) {
    e.preventDefault();
    const nameInput = document.getElementById('reg-username').value;
    const emailInput = document.getElementById('reg-email').value;
    
    if(state.isLoginMode) {
        // Find existing profile
        const matchedUser = state.users.find(u => u.email.toLowerCase() === emailInput.toLowerCase());
        state.currentUser = matchedUser ? matchedUser : { name: emailInput.split('@')[0], email: emailInput };
        triggerToast(`Signed in as ${state.currentUser.name}`);
    } else {
        // Register brand new profile
        const newUser = {
            id: `U-${Math.floor(1000 + Math.random() * 9000)}`,
            name: nameInput || "Anonymous Snacker",
            email: emailInput,
            joined: new Date().toISOString().slice(0, 10),
            orderCount: 0
        };
        state.users.push(newUser);
        state.currentUser = newUser;
        renderUsersTable();
        triggerToast("Account registered successfully!");
    }
    toggleAuthModal(false);
    renderAuthBar();
    document.getElementById('auth-form').reset();
}

function logOut() {
    state.currentUser = null;
    renderAuthBar();
    triggerToast("Signed out of session.");
}

function renderAuthBar() {
    const container = document.getElementById('auth-bar-container');
    if (state.currentUser) {
        container.innerHTML = `
            <div class="user-welcome-info">
                <div class="user-avatar">${state.currentUser.name[0].toUpperCase()}</div>
                <div>
                    <p style="font-size: 0.8rem; color: var(--text-muted);">Logged in profile</p>
                    <h4 style="font-weight: 700;">${state.currentUser.name}</h4>
                </div>
            </div>
            <button class="btn-secondary" onclick="logOut()">Sign Out</button>
        `;
    } else {
        container.innerHTML = `
            <div>
                <h4 style="font-weight: 700;">Exclusive Snacking Deals</h4>
                <p style="font-size: 0.85rem; color: var(--text-muted); margin-top:2px;">Register an account to log loyalty and customize trackable orders.</p>
            </div>
            <div style="display: flex; gap: 1rem;">
                <button class="btn-secondary" onclick="toggleAuthModal(true); toggleAuthMode(true);">Sign In</button>
                <button class="btn-primary" onclick="toggleAuthModal(true); toggleAuthMode(false);">Create Account</button>
            </div>
        `;
    }
    lucide.createIcons();
}

// --- PORTAL MENU & SHOPPING CART ---
function renderMenu() {
    const container = document.getElementById('menu-container');
    container.innerHTML = menuData.map(item => `
        <div class="menu-card">
            <img class="menu-img" src="${item.img}" alt="${item.name}">
            <span class="menu-badge">${item.category}</span>
            <div class="menu-info">
                <h4 class="menu-title">${item.name}</h4>
                <p class="menu-desc">${item.desc}</p>
                <div class="menu-footer">
                    <span class="menu-price">$${item.price.toFixed(2)}</span>
                    <button class="btn-add-cart" onclick="addToCart(${item.id})">
                        <i data-lucide="plus" style="width: 18px; height: 18px;"></i>
                    </button>
                </div>
            </div>
        </div>
    `).join('');
    lucide.createIcons();
}

function addToCart(itemId) {
    const foundItem = menuData.find(i => i.id === itemId);
    const cartItemIndex = state.cart.findIndex(c => c.id === itemId);

    if(cartItemIndex > -1) {
        state.cart[cartItemIndex].qty += 1;
    } else {
        state.cart.push({ ...foundItem, qty: 1 });
    }
    triggerToast(`${foundItem.name} added to cart`);
    renderCart();
}

function alterQty(itemId, delta) {
    const cartIndex = state.cart.findIndex(c => c.id === itemId);
    if (cartIndex > -1) {
        state.cart[cartIndex].qty += delta;
        if(state.cart[cartIndex].qty <= 0) {
            state.cart.splice(cartIndex, 1);
        }
    }
    renderCart();
}

function renderCart() {
    const container = document.getElementById('cart-container');
    const subtotalText = document.getElementById('subtotal-val');
    const totalText = document.getElementById('total-val');

    if(state.cart.length === 0) {
        container.innerHTML = `
            <div class="cart-empty">
                <i data-lucide="shopping-basket" style="width: 48px; height: 48px; stroke-width: 1.5; color: var(--text-muted)"></i>
                <p>No snacks chosen yet.</p>
            </div>
        `;
        subtotalText.innerText = "$0.00";
        totalText.innerText = "$0.00";
        lucide.createIcons();
        return;
    }

    container.innerHTML = state.cart.map(item => `
        <div class="cart-item">
            <div class="cart-item-info">
                <h4>${item.name}</h4>
                <p>$${(item.price * item.qty).toFixed(2)}</p>
            </div>
            <div class="cart-qty-controls">
                <button class="cart-qty-btn" onclick="alterQty(${item.id}, -1)">-</button>
                <span style="font-weight:600; font-size:0.9rem;">${item.qty}</span>
                <button class="cart-qty-btn" onclick="alterQty(${item.id}, 1)">+</button>
            </div>
        </div>
    `).join('');

    let subtotal = state.cart.reduce((sum, current) => sum + (current.price * current.qty), 0);
    let finalTotal = subtotal + 2.50;

    subtotalText.innerText = `$${subtotal.toFixed(2)}`;
    totalText.innerText = `$${finalTotal.toFixed(2)}`;
    lucide.createIcons();
}

function placeOrder() {
    if(state.cart.length === 0) {
        triggerToast("Select food to checkout!");
        return;
    }

    const customerName = state.currentUser ? state.currentUser.name : "Walk-in Guest";
    const itemsSummary = state.cart.map(i => `${i.qty}x ${i.name}`).join(', ');
    const finalBill = state.cart.reduce((sum, item) => sum + (item.price * item.qty), 0) + 2.50;

    // Build unique Order Record
    const newOrder = {
        id: `ORD-${Math.floor(1000 + Math.random() * 9000)}`,
        user: customerName,
        items: itemsSummary,
        total: parseFloat(finalBill.toFixed(2)),
        status: "pending",
        date: new Date().toISOString().slice(0, 10)
    };

    state.orders.push(newOrder);

    // Apply tracking metrics update if user is logged in
    if(state.currentUser) {
        const userObj = state.users.find(u => u.email === state.currentUser.email);
        if(userObj) userObj.orderCount += 1;
    }

    state.cart = []; // empty the active cart
    renderCart();
    renderOrdersTable();
    renderUsersTable();
    triggerToast("Order transmitted to kitchen!");
}

// --- ADMIN ORDERS PANEL LIFECYCLE ---
function renderOrdersTable() {
    const tableBody = document.getElementById('orders-table-body');
    
    // Recalculate metrics card metrics dynamically
    let revSum = state.orders.reduce((sum, o) => o.status === 'completed' ? sum + o.total : sum, 0);
    let activeLen = state.orders.filter(o => o.status !== 'completed').length;
    let compLen = state.orders.filter(o => o.status === 'completed').length;

    document.getElementById('stat-revenue').innerText = `$${revSum.toFixed(2)}`;
    document.getElementById('stat-completed-count').innerText = compLen;
    document.getElementById('stat-active-count').innerText = activeLen;

    if (state.orders.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--text-muted); padding: 3rem;">No active kitchen tickets.</td></tr>`;
        return;
    }

    tableBody.innerHTML = state.orders.map(o => `
        <tr>
            <td style="font-weight: 700; color: var(--accent);">${o.id}</td>
            <td>${o.user}</td>
            <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${o.items}</td>
            <td style="font-weight: 700;">$${o.total.toFixed(2)}</td>
            <td>
                <span class="badge-status ${o.status}">${o.status}</span>
            </td>
            <td>
                <select class="action-select" onchange="updateOrderStatus('${o.id}', this.value)">
                    <option value="pending" ${o.status === 'pending' ? 'selected' : ''}>Pending</option>
                    <option value="preparing" ${o.status === 'preparing' ? 'selected' : ''}>Preparing</option>
                    <option value="delivery" ${o.status === 'delivery' ? 'selected' : ''}>Out for Delivery</option>
                    <option value="completed" ${o.status === 'completed' ? 'selected' : ''}>Delivered</option>
                </select>
            </td>
        </tr>
    `).join('');
}

function updateOrderStatus(orderId, nextStatus) {
    const targetOrder = state.orders.find(o => o.id === orderId);
    if(targetOrder) {
        targetOrder.status = nextStatus;
        renderOrdersTable();
        triggerToast(`Order ${orderId} marked as ${nextStatus}`);
    }
}

// --- USER DATABASE PROFILE VIEWS ---
function renderUsersTable() {
    const tableBody = document.getElementById('users-table-body');
    const searchKeyword = document.getElementById('user-search-input').value.toLowerCase();

    const filteredUsers = state.users.filter(user => 
        user.name.toLowerCase().includes(searchKeyword) || 
        user.email.toLowerCase().includes(searchKeyword)
    );

    if(filteredUsers.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: var(--text-muted); padding: 3rem;">No matching user accounts.</td></tr>`;
        return;
    }

    tableBody.innerHTML = filteredUsers.map(user => `
        <tr>
            <td>
                <div class="user-cell">
                    <div class="user-avatar">${user.name[0].toUpperCase()}</div>
                    <div>
                        <h4 style="font-weight: 700;">${user.name}</h4>
                        <span style="font-size:0.75rem; color: var(--accent); font-weight:600;">ID: ${user.id}</span>
                    </div>
                </div>
            </td>
            <td>${user.email}</td>
            <td>${user.joined}</td>
            <td style="font-weight: 700; text-align: center;">${user.orderCount} Orders</td>
        </tr>
    `).join('');
}