export const appState = {
  menu: [],
  cart: [],
  users: [],
  orders: [],
  currentUser: null,
  isLoginMode: false
};

export const makeId = (prefix = 'ID') => `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;
