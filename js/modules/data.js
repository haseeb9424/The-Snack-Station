export const adminDashboardData = {
  metrics: [
    { icon: 'wallet', label: 'Total Revenue', value: '$0.00' },
    { icon: 'shopping-cart', label: 'Completed Tickets', value: '0' },
    { icon: 'hourglass', label: 'In Queue', value: '0' }
  ],
  orders: [
    { id: 'ORD-9421', customer: 'Sarah Khan', total: '$22.98', status: 'completed' },
    { id: 'ORD-9422', customer: 'Usman Ahmed', total: '$16.48', status: 'preparing' }
  ],
  users: [
    { name: 'Sarah Khan', email: 'sarah@gmail.com', joined: '2026-05-12', orders: 4 },
    { name: 'Usman Ahmed', email: 'usman@hotmail.com', joined: '2026-06-20', orders: 7 }
  ]
};
