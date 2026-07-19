// Addons are separate entities from menu items, stored independently.
export interface Addon {
  id: string;
  name: string;
  price: number;
  category?: string;
  isAvailable: boolean;
  createdAt: number;
}

const KEY = 'pos_addons_v1';

export const getAddons = (): Addon[] => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Addon[]) : [];
  } catch {
    return [];
  }
};

export const saveAddons = (list: Addon[]) => {
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent('addons-updated'));
};

export const addAddon = (data: Omit<Addon, 'id' | 'createdAt'>): Addon => {
  const addon: Addon = {
    id: (crypto as any).randomUUID ? crypto.randomUUID() : `addon_${Date.now()}`,
    createdAt: Date.now(),
    ...data,
  };
  const list = getAddons();
  list.unshift(addon);
  saveAddons(list);
  return addon;
};

export const updateAddon = (id: string, patch: Partial<Omit<Addon, 'id' | 'createdAt'>>) => {
  const list = getAddons().map(a => (a.id === id ? { ...a, ...patch } : a));
  saveAddons(list);
};

export const deleteAddon = (id: string) => {
  saveAddons(getAddons().filter(a => a.id !== id));
};
