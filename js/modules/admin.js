import { adminDashboardData } from './data.js';

function renderStats() {
  const statsWrap = document.querySelector('[data-admin-stats]');
  if (!statsWrap) return;

  statsWrap.innerHTML = adminDashboardData.metrics
    .map((item) => `
      <div class="card stat-card">
        <div class="stat-icon"><i data-lucide="${item.icon}"></i></div>
        <div class="stat-info">
          <p>${item.label}</p>
          <h3>${item.value}</h3>
        </div>
      </div>
    `)
    .join('');

  if (window.lucide?.createIcons) {
    window.lucide.createIcons();
  }
}

function renderTables() {
  const ordersBody = document.querySelector('[data-orders-table]');
  const usersBody = document.querySelector('[data-users-table]');

  if (ordersBody) {
    ordersBody.innerHTML = adminDashboardData.orders
      .map((order) => `
        <tr>
          <td>${order.id}</td>
          <td>${order.customer}</td>
          <td>${order.total}</td>
          <td><span class="badge-status ${order.status}">${order.status}</span></td>
        </tr>
      `)
      .join('');
  }

  if (usersBody) {
    usersBody.innerHTML = adminDashboardData.users
      .map((user) => `
        <tr>
          <td>${user.name}</td>
          <td>${user.email}</td>
          <td>${user.joined}</td>
          <td>${user.orders}</td>
        </tr>
      `)
      .join('');
  }
}

export function initAdminDashboard() {
  renderStats();
  renderTables();
}
