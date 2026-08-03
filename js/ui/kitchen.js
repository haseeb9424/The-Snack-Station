import { db } from '../config/firebase.js';
import { collection, onSnapshot, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { showToast } from '../utils/toast.js';

export const initKitchenBoard = () => {
    const kitchenPanel = document.getElementById('kitchen-panel');
    if (!kitchenPanel) return;

    onSnapshot(collection(db, 'orders'), (snapshot) => {
        const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        kitchenPanel.innerHTML = `
            <h2>Kitchen Kanban Board</h2>
            <div class="kanban-grid" style="margin-top: 1.5rem;">
                ${renderColumn('Pending Orders', orders.filter(o => o.status === 'pending'), 'pending', 'preparing')}
                ${renderColumn('In Preparation', orders.filter(o => o.status === 'preparing'), 'preparing', 'ready')}
                ${renderColumn('Ready for Pickup/Delivery', orders.filter(o => o.status === 'ready'), 'ready', 'delivered')}
            </div>
        `;

        // Attach transition handlers
        kitchenPanel.querySelectorAll('.status-btn').forEach(button => {
            button.addEventListener('click', async () => {
                const orderId = button.getAttribute('data-id');
                const nextStatus = button.getAttribute('data-next');
                try {
                    await updateDoc(doc(db, 'orders', orderId), { status: nextStatus });
                    showToast(`Order status updated to ${nextStatus}`, 'info');
                } catch (e) {
                    showToast('Failed to update order status', 'danger');
                }
            });
        });
    });
};

const renderColumn = (title, orders, statusClass, nextStatus) => `
    <div class="kanban-column">
        <div class="column-header ${statusClass}">
            <h3>${title}</h3>
            <span class="badge">${orders.length}</span>
        </div>
        ${orders.map(order => `
            <div class="kanban-card">
                <div class="kanban-card-header">
                    <span>#${order.id.slice(0, 6)}</span>
                    <small>${order.customerName || 'Guest'}</small>
                </div>
                <ul class="order-items-list">
                    ${(order.items || []).map(i => `<li>${i.quantity}x ${i.name}</li>`).join('')}
                </ul>
                ${nextStatus ? `<button class="status-btn" data-id="${order.id}" data-next="${nextStatus}" style="background: var(--bg-card); border: 1px solid var(--border-color); color: var(--text-main); padding: 0.5rem; border-radius: var(--radius-btn); cursor: pointer; font-weight: 600; margin-top: 0.5rem;">Mark ${nextStatus.toUpperCase()}</button>` : ''}
            </div>
        `).join('')}
    </div>
`;