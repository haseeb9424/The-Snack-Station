import { db } from '../config/firebase.js';
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { formatCurrency } from '../utils/formatters.js';

export const trackOrder = (orderId, containerId = 'tracker-panel') => {
    const container = document.getElementById(containerId);
    if (!container || !orderId) return;

    return onSnapshot(doc(db, 'orders', orderId), (docSnap) => {
        if (!docSnap.exists()) {
            container.innerHTML = `<div style="text-align: center; color: var(--danger); padding: 2rem;">Order #${orderId} not found.</div>`;
            return;
        }

        const data = docSnap.data();
        
        container.innerHTML = `
            <div class="tracker-card" style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 2rem; max-width: 600px; margin: 0 auto;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                    <h3>Order #${docSnap.id.slice(0, 8)}</h3>
                    <span class="badge" style="text-transform: uppercase;">${data.status}</span>
                </div>
                
                <div class="progress-bar-wrapper" style="margin: 2rem 0; height: 8px; background: var(--bg-input); border-radius: 4px; overflow: hidden;">
                    <div class="progress-bar" style="width: ${getStatusPercentage(data.status)}%; height: 100%; background: var(--accent); transition: var(--transition);"></div>
                </div>

                <h4>Items Ordered:</h4>
                <ul style="list-style: none; margin-top: 0.5rem;">
                    ${data.items.map(item => `
                        <li style="display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid var(--border-color);">
                            <span>${item.quantity}x ${item.name}</span>
                            <span>${formatCurrency(item.price * item.quantity)}</span>
                        </li>
                    `).join('')}
                </ul>

                <div style="display: flex; justify-content: space-between; margin-top: 1.5rem; font-weight: 700; font-size: 1.1rem;">
                    <span>Total Paid:</span>
                    <span>${formatCurrency(data.grandTotal)}</span>
                </div>
            </div>
        `;
    });
};

const getStatusPercentage = (status) => {
    switch (status) {
        case 'pending': return 25;
        case 'preparing': return 60;
        case 'ready': return 90;
        case 'delivered': return 100;
        default: return 0;
    }
};