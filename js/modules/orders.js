import { appState } from './state.js';
import { formatCurrency } from './formatters.js';

export function renderOrdersTable() {
  const tableBody = document.getElementById('orders-table-body');
  if (!tableBody) return;

  tableBody.innerHTML = appState.orders
    .map((order) => `
      <tr>
        <td>${order.id}</td>
        <td>${order.user}</td>
        <td>${order.items}</td>
        <td>${formatCurrency(order.total)}</td>
        <td><span class="badge-status ${order.status}">${order.status}</span></td>
      </tr>
    `)
    .join('');
}
