// Multi-tab isolation patch for POS
// This ensures that when users open multiple stores in different browser tabs,
// the localStorage variables don't bleed across tabs and mix data.
const ISOLATED_KEYS = [
  'pos_active_store_data', 
  'pos_active_store', 
  'owner_selected_store_id', 
  'owner_selected_store_name',
  'owner_store_selection_done',
  'pos_is_store_login', 
  'pos_store_code'
];

const originalGetItem = localStorage.getItem.bind(localStorage);
const originalSetItem = localStorage.setItem.bind(localStorage);
const originalRemoveItem = localStorage.removeItem.bind(localStorage);

localStorage.getItem = function(key: string) {
  if (key && ISOLATED_KEYS.includes(key)) {
    const sessionVal = sessionStorage.getItem(key);
    if (sessionVal !== null) return sessionVal;
  }
  return originalGetItem(key);
};

localStorage.setItem = function(key: string, value: string) {
  if (key && ISOLATED_KEYS.includes(key)) {
    sessionStorage.setItem(key, value);
  }
  originalSetItem(key, value);
};

localStorage.removeItem = function(key: string) {
  if (key && ISOLATED_KEYS.includes(key)) {
    sessionStorage.removeItem(key);
  }
  originalRemoveItem(key);
};
