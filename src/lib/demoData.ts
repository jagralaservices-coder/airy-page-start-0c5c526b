// Demo data generation has been permanently disabled.
// New stores must start empty so merchants don't see seeded sample data
// (menu items, customers, orders, staff, etc.) on their first login.
export const generateClientDemoData = async (_storeId: string, _customerId: string) => {
  console.warn('[demoData] generateClientDemoData is disabled — no demo data will be seeded.');
  return;
};
