export const initTheme = () => {
    const savedTheme = localStorage.getItem('snack_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
};

export const toggleTheme = () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('snack_theme', newTheme);
};