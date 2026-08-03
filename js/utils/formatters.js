export const formatCurrency = (amount = 0) => {
    return `Rs. ${Number(amount).toLocaleString('en-PK')}`;
};

export const formatDate = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};