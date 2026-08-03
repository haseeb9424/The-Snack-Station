export const showToast = (message, type = 'info') => {
    const toast = document.getElementById('toast-notification');
    if (!toast) return;

    toast.textContent = message;
    toast.className = `toast show toast-${type}`;

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
};