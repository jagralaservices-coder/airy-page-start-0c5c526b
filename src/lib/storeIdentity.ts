// Shared store identity helpers.
// Pure localStorage/sessionStorage readers — no business logic.

export const getCurrentStoreId = (): string | null => {
  const ownerSelected = localStorage.getItem('owner_selected_store_id');
  if (ownerSelected) return ownerSelected;

  try {
    const storeData = localStorage.getItem('pos_active_store_data');
    if (storeData) {
      const parsed = JSON.parse(storeData);
      if (parsed?.id) return parsed.id;
      if (parsed?.storeId) return parsed.storeId;
    }
  } catch {}

  const activeStore = localStorage.getItem('pos_active_store');
  if (activeStore) {
    try { return JSON.parse(activeStore); } catch {}
  }
  return null;
};

export const getCurrentStoreCode = (): string | null => {
  const direct = localStorage.getItem('pos_store_code');
  if (direct) return direct;

  try {
    const storeData = localStorage.getItem('pos_active_store_data');
    if (storeData) {
      const parsed = JSON.parse(storeData);
      if (parsed?.storeCode) return parsed.storeCode;
      if (parsed?.store_code) return parsed.store_code;
    }
  } catch {}

  return null;
};
