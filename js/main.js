import { initializeTheme } from './modules/theme.js';
import { initWorkspaceLayout } from './modules/ui.js';
import { initAdminDashboard } from './modules/admin.js';
import { renderAuthSummary } from './modules/auth.js';
import { renderMenuCards } from './modules/menu.js';
import { renderOrdersTable } from './modules/orders.js';
import { renderDashboardOverview } from './modules/dashboard.js';
import { appState } from './modules/state.js';

window.addEventListener('DOMContentLoaded', () => {
  initializeTheme();
  initWorkspaceLayout();
  appState.menu = [
    { id: 1, name: 'Gourmet Jalapeño Popper Fries', price: 6.99, category: 'Fries', img: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3', desc: 'Cripsy premium seasoned potato strips with warm cheese sauce & jalapeños.' },
    { id: 2, name: 'The Station Double Smashed Burger', price: 9.49, category: 'Burgers', img: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3', desc: 'Two smashed angus beef patties, cheddar cheese, secret relish on potato bun.' }
  ];
  appState.orders = [
    { id: 'ORD-9421', user: 'Sarah Khan', items: '1x Double Smashed Burger', total: 22.98, status: 'completed' },
    { id: 'ORD-9422', user: 'Usman Ahmed', items: '2x Jalapeño Popper Fries', total: 16.48, status: 'preparing' }
  ];
  renderAuthSummary();
  renderMenuCards();
  renderOrdersTable();
  renderDashboardOverview();
  initAdminDashboard();
});
