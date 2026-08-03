export function formatCurrency(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

export function getInitials(name = '') {
  const cleaned = String(name).trim();
  if (!cleaned) return 'U';
  return cleaned
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() || '')
    .join('');
}

export function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
