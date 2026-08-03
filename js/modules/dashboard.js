import { appState } from './state.js';
import { formatCurrency } from './formatters.js';

export function renderDashboardOverview() {
  const revenue = appState.orders
    .filter(order => order.status === 'completed')
    .reduce((sum, order) => sum + Number(order.total || 0), 0);

  const completed = appState.orders.filter(order => order.status === 'completed').length;
  const active = appState.orders.filter(order => order.status !== 'completed').length;

  const totalRevenue = document.getElementById('stat-revenue');
  const completedCount = document.getElementById('stat-completed-count');
  const activeCount = document.getElementById('stat-active-count');

  if (totalRevenue) totalRevenue.textContent = formatCurrency(revenue);
  if (completedCount) completedCount.textContent = String(completed);
  if (activeCount) activeCount.textContent = String(active);
}
