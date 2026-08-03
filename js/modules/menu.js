import { appState } from './state.js';
import { formatCurrency } from './formatters.js';

export function renderMenuCards() {
  const container = document.getElementById('menu-container');
  if (!container) return;

  container.innerHTML = appState.menu
    .map((item) => `
      <article class="menu-card">
        <img class="menu-img" src="${item.img}" alt="${item.name}">
        <span class="menu-badge">${item.category}</span>
        <div class="menu-info">
          <h4 class="menu-title">${item.name}</h4>
          <p class="menu-desc">${item.desc}</p>
          <div class="menu-footer">
            <span class="menu-price">${formatCurrency(item.price)}</span>
            <button class="btn-add-cart" type="button" data-item-id="${item.id}">+</button>
          </div>
        </div>
      </article>
    `)
    .join('');

  if (window.lucide?.createIcons) window.lucide.createIcons();
}
