export const store = {
    currentUser: null,
    userRole: 'customer', // 'customer' | 'staff' | 'admin'
    cart: [],
    menuItems: [],
    categories: ['All', 'Burgers', 'Snacks', 'Beverages', 'Deals'],
    activeCategory: 'All',
    activeView: 'portal',
    activeOrder: null
};

export const setStoreState = (key, value) => {
    store[key] = value;
    window.dispatchEvent(new CustomEvent(`state:${key}`, { detail: value }));
};

export const getStoreState = (key) => store[key];