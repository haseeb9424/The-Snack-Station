import { db } from '../config/firebase.js';
import { collection, addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { showToast } from '../utils/toast.js';

export const initAdminPanel = () => {
    const adminPanel = document.getElementById('admin-panel');
    if (!adminPanel) return;

    adminPanel.innerHTML = `
        <h2>Admin Management Panel</h2>
        <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 1.5rem; margin-top: 1rem; max-width: 500px;">
            <h3>Add New Menu Item</h3>
            <form id="add-item-form" style="display: flex; flex-direction: column; gap: 1rem; margin-top: 1rem;">
                <input type="text" id="item-name" placeholder="Item Name" required style="padding: 0.75rem; background: var(--bg-input); border: 1px solid var(--border-color); color: var(--text-main); border-radius: var(--radius-md);">
                <input type="text" id="item-desc" placeholder="Description" style="padding: 0.75rem; background: var(--bg-input); border: 1px solid var(--border-color); color: var(--text-main); border-radius: var(--radius-md);">
                <input type="number" id="item-price" placeholder="Price (PKR)" required style="padding: 0.75rem; background: var(--bg-input); border: 1px solid var(--border-color); color: var(--text-main); border-radius: var(--radius-md);">
                <button type="submit" style="background: var(--accent); color: white; padding: 0.75rem; border: none; border-radius: var(--radius-btn); cursor: pointer; font-weight: 600;">Add Item</button>
            </form>
        </div>
    `;

    document.getElementById('add-item-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('item-name').value;
        const description = document.getElementById('item-desc').value;
        const price = parseFloat(document.getElementById('item-price').value);

        try {
            await addDoc(collection(db, 'menu'), { name, description, price, available: true });
            showToast(`Added ${name} to store menu!`, 'success');
            e.target.reset();
        } catch (err) {
            console.error("Error adding product:", err);
            showToast('Failed to add item', 'danger');
        }
    });
};