import { addToCart } from '../state/cart.js';
import { formatCurrency } from '../utils/formatters.js';

export const renderMenu = (items, containerId = 'portal-panel') => {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!items || items.length === 0) {
        container.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 3rem;">No items available right now.</p>`;
        return;
    }

    container.innerHTML = `
        <div class="menu-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 1.5rem;">
            ${items.map(item => `
                <div class="menu-card" style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-card); padding: 1.25rem; display: flex; flex-direction: column; justify-content: space-between;">
                    <div>
                        <h3 style="font-size: 1.1rem; margin-bottom: 0.5rem;">${item.name}</h3>
                        <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: 1rem;">${item.description || 'Delicious snack made fresh.'}</p>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 1rem;">
                        <strong style="font-size: 1.1rem; color: var(--accent);">${formatCurrency(item.price)}</strong>
                        <button class="add-to-cart-btn" data-id="${item.id}" style="background: var(--accent); color: white; border: none; padding: 0.5rem 1rem; border-radius: var(--radius-btn); cursor: pointer; font-weight: 600;">
                            Add +
                        </button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    // Attach click handlers to dynamically generated buttons
    container.querySelectorAll('.add-to-cart-btn').forEach(button => {
        button.addEventListener('click', () => {
            const itemId = button.getAttribute('data-id');
            const selectedItem = items.find(i => i.id === itemId);
            if (selectedItem) addToCart(selectedItem);
        });
    });
};