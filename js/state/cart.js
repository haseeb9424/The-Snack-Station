import { store, setStoreState } from './store.js';
import { showToast } from '../utils/toast.js';

export const addToCart = (item) => {
    const existingIndex = store.cart.findIndex(i => i.id === item.id);
    let updatedCart = [...store.cart];

    if (existingIndex > -1) {
        updatedCart[existingIndex].quantity += 1;
    } else {
        updatedCart.push({ ...item, quantity: 1 });
    }

    setStoreState('cart', updatedCart);
    showToast(`Added ${item.name} to cart`, 'success');
};

export const removeFromCart = (itemId) => {
    const updatedCart = store.cart.filter(item => item.id !== itemId);
    setStoreState('cart', updatedCart);
};

export const updateQuantity = (itemId, delta) => {
    const updatedCart = store.cart.map(item => {
        if (item.id === itemId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
        }
        return item;
    }).filter(Boolean);

    setStoreState('cart', updatedCart);
};