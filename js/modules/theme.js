export function initializeTheme() {
  const saved = localStorage.getItem('snack-station-theme');
  const preferred = saved || 'light';
  document.documentElement.setAttribute('data-theme', preferred);
  return preferred;
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const next = current === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('snack-station-theme', next);
  return next;
}
