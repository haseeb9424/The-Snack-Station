import { appState } from './state.js';
import { getInitials } from './formatters.js';

export function renderAuthSummary() {
  const container = document.getElementById('auth-bar-container');
  const displayUser = appState.currentUser;

  if (!container) return;

  if (displayUser) {
    container.innerHTML = `
      <div class="user-welcome-info">
        <div class="user-avatar">${getInitials(displayUser.name || displayUser.email)}</div>
        <div class="user-welcome-text">
          <h4>${displayUser.name || displayUser.email || 'Account'}</h4>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <button class="btn-primary account-access-button" type="button" aria-label="Sign in or create an account">
      <i data-lucide="user-round"></i><span>Account</span>
    </button>
  `;

  if (window.lucide?.createIcons) window.lucide.createIcons();
}
