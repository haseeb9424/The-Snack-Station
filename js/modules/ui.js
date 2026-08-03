export function initWorkspaceLayout() {
  const sidebar = document.getElementById('workspace-sidebar');
  const body = document.body;

  if (sidebar) {
    body.classList.add('staff-workspace');
  }
}
