import { store, setStoreState } from '../state/store.js';
import { db } from '../config/firebase.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { showToast } from '../utils/toast.js';

export const submitOrder = async (customerDetails = {}) => {
    if (!store.cart || store.cart.length === 0) {
        showToast('Your cart is empty!', 'warning');
        return null;
    }

    try {
        const totalAmount = store.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

        const orderPayload = {
            customerName: customerDetails.name || 'Guest User',
            phone: customerDetails.phone || '',
            address: customerDetails.address || 'Pickup',
            items: store.cart,
            subtotal: totalAmount,
            deliveryFee: 150,
            grandTotal: totalAmount + 150,
            status: 'pending',
            createdAt: serverTimestamp()
        };

        const docRef = await addDoc(collection(db, 'orders'), orderPayload);
        
        setStoreState('cart', []);
        showToast('Order placed successfully!', 'success');
        
        return docRef.id;
    } catch (error) {
        console.error("Error submitting order to Firestore:", error);
        showToast('Failed to place order. Please try again.', 'danger');
        return null;
    }
};