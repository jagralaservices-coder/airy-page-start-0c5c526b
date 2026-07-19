import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePOS } from '@/contexts/POSContext';
import { formatCurrency, MenuItem, getInventory, InventoryItem } from '@/lib/store';
import { useSubscription } from '@/hooks/useSubscription';
import { cn } from '@/lib/utils';
import { 
  Search, 
  ToggleLeft, 
  ToggleRight,
  Plus,
  Edit,
  Trash2,
  Upload,
  X,
  Package,
  RefreshCw,
  AlertTriangle,
  ArrowLeft,
  Check,
  Minus,
  PlusCircle,
  Store,
  ChevronDown,
  Link2,
  UtensilsCrossed,
  Barcode,
  Printer,
  Tag
} from 'lucide-react';
import { listBrands, Brand } from '@/lib/brands';
import { BulkMenuUpload } from './BulkMenuUpload';
import { VariationManagementDialog } from './VariationManagementDialog';
import { BarcodePrintDialog } from './BarcodePrintDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { MenuImageUpload } from './MenuImageUpload';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MenuIngredientsDialog } from './MenuIngredientsDialog';
import { MenuItemIngredient, MenuItemVariation } from '@/lib/store';
interface ParsedMenuItem {
  name: string;
  nameHindi?: string;
  price: number;
  category: string;
  description?: string;
}

export const MenuManagement: React.FC = () => {
  const navigate = useNavigate();
  const { menuItems, categories, toggleItemAvailability, activeCategory, setActiveCategory, addMenuItems, deleteMenuItem, updateMenuItem, syncCategoriesFromMenu, lowStockItems, stores, activeStore, setActiveStoreId, getStoreSales, addCategory, isStoreLogin } = usePOS();
  const { canAccess: canAccessFeature } = useSubscription();
  const hasRecipeAccess = canAccessFeature('recipeInventory');
  const [searchQuery, setSearchQuery] = useState('');
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [showEditItem, setShowEditItem] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [newItem, setNewItem] = useState({ name: '', price: '', category: categories[0]?.id || '', stock: '', linkedInventoryId: '', gramagePerUnit: '', sku: '', isVariable: false, isPrompt: false, brandId: '' });
  
  // Category creation states
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryIcon, setNewCategoryIcon] = useState('🍽️');
  const [categorySource, setCategorySource] = useState<'new' | 'edit'>('new');
  const [newItemImage, setNewItemImage] = useState('');
  const [editItem, setEditItem] = useState({ name: '', price: '', category: '', stock: '', storeStocks: {} as { [key: string]: string }, stockAlertThreshold: '', linkedInventoryId: '', gramagePerUnit: '', sku: '', image: '', isVariable: false, isPrompt: false, brandId: '' });
  const [brands, setBrands] = useState<Brand[]>([]);
  const [editingStockId, setEditingStockId] = useState<string | null>(null);
  const [tempStock, setTempStock] = useState<string>('');
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [showRecipeDialog, setShowRecipeDialog] = useState(false);
  const [recipeMenuItem, setRecipeMenuItem] = useState<MenuItem | null>(null);
  const [showVariationDialog, setShowVariationDialog] = useState(false);
  const [variationMenuItem, setVariationMenuItem] = useState<MenuItem | null>(null);
  const [showBarcodeDialog, setShowBarcodeDialog] = useState(false);
  const [barcodeMenuItem, setBarcodeMenuItem] = useState<MenuItem | null>(null);
  const [showAddonsManager, setShowAddonsManager] = useState(false);
  const [addons, setAddons] = useState<import('@/lib/addons').Addon[]>([]);
  const [addonForm, setAddonForm] = useState({ name: '', price: '', category: '' });
  const [editingAddonId, setEditingAddonId] = useState<string | null>(null);

  useEffect(() => {
    const load = () => {
      import('@/lib/addons').then(({ getAddons }) => setAddons(getAddons()));
    };
    load();
    window.addEventListener('addons-updated', load);
    return () => window.removeEventListener('addons-updated', load);
  }, []);

  // Load brands for the active store
  useEffect(() => {
    if (!activeStore?.id) { setBrands([]); return; }
    listBrands([activeStore.id])
      .then((rows) => setBrands(rows.filter(b => b.status === 'active')))
      .catch(() => setBrands([]));
  }, [activeStore?.id]);

  const handleSaveAddon = async () => {
    if (!addonForm.name.trim() || !addonForm.price) {
      toast.error('Name and price required');
      return;
    }
    const price = parseFloat(addonForm.price);
    if (isNaN(price) || price < 0) {
      toast.error('Invalid price');
      return;
    }
    const mod = await import('@/lib/addons');
    if (editingAddonId) {
      mod.updateAddon(editingAddonId, { name: addonForm.name.trim(), price, category: addonForm.category.trim() || undefined });
      toast.success('Addon updated');
    } else {
      mod.addAddon({ name: addonForm.name.trim(), price, category: addonForm.category.trim() || undefined, isAvailable: true });
      toast.success('Addon added');
    }
    setAddonForm({ name: '', price: '', category: '' });
    setEditingAddonId(null);
  };

  const handleEditAddon = (a: import('@/lib/addons').Addon) => {
    setEditingAddonId(a.id);
    setAddonForm({ name: a.name, price: String(a.price), category: a.category || '' });
  };

  const handleDeleteAddon = async (id: string) => {
    const mod = await import('@/lib/addons');
    mod.deleteAddon(id);
    toast.success('Addon deleted');
    if (editingAddonId === id) {
      setEditingAddonId(null);
      setAddonForm({ name: '', price: '', category: '' });
    }
  };

  const toggleAddonAvailable = async (a: import('@/lib/addons').Addon) => {
    const mod = await import('@/lib/addons');
    mod.updateAddon(a.id, { isAvailable: !a.isAvailable });
  };

  // Load inventory items
  useEffect(() => {
    setInventoryItems(getInventory());
  }, []);

  // Auto-select first category if currently empty and categories load
  useEffect(() => {
    if (categories.length > 0 && !newItem.category) {
      setNewItem(prev => ({ ...prev, category: categories[0].id }));
    }
  }, [categories, newItem.category]);

  const filteredItems = menuItems.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         item.nameHindi?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (item.sku && item.sku.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = activeCategory === 'all' || item.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const handleBulkImport = (items: ParsedMenuItem[]) => {
    console.log('Imported items:', items);
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    const catId = newCategoryName.toLowerCase().trim().replace(/\s+/g, '-');
    await addCategory({
      id: catId,
      name: newCategoryName.trim(),
      icon: newCategoryIcon.trim() || '🍽️'
    });
    
    // Auto-select the newly created category
    if (categorySource === 'new') {
      setNewItem(prev => ({ ...prev, category: catId }));
    } else {
      setEditItem(prev => ({ ...prev, category: catId }));
    }
    
    setShowAddCategory(false);
    setNewCategoryName('');
    setNewCategoryIcon('🍽️');
    toast.success('Category added successfully!');
  };

  const handleAddItem = async () => {
    if (!newItem.name || (!newItem.price && !newItem.isPrompt)) {
      toast.error('Please fill all fields');
      return;
    }
    const brandRow = newItem.brandId ? brands.find(b => b.id === newItem.brandId) : null;
    const added = await addMenuItems([{
      name: newItem.name,
      price: newItem.isPrompt ? 0 : Number(newItem.price),
      category: newItem.category,
      preparationTime: newItem.isPrompt ? 998 : (newItem.isVariable ? 999 : 10),
      stock: newItem.stock ? Number(newItem.stock) : undefined,
      linkedInventoryId: newItem.linkedInventoryId || undefined,
      gramagePerUnit: newItem.gramagePerUnit ? Number(newItem.gramagePerUnit) : undefined,
      sku: newItem.sku.trim() || undefined,
      image: newItemImage || undefined,
      brandId: brandRow?.id ?? null,
      brandName: brandRow?.name,
      brandType: brandRow ? brandRow.brand_type : 'internal',
    }]);
    if (!added) return;
    toast.success('Item added successfully!');
    setNewItem({ name: '', price: '', category: categories[0]?.id || 'general', stock: '', linkedInventoryId: '', gramagePerUnit: '', sku: '', isVariable: false, isPrompt: false, brandId: '' });
    setNewItemImage('');
    setShowAddItem(false);
  };

  const handleEditItem = () => {
    if (!editingItem || !editItem.name || (!editItem.price && !editItem.isPrompt)) {
      toast.error('Please fill all fields');
      return;
    }
    
    // Convert store stocks to numbers
    const storeStock: { [key: string]: number } = {};
    Object.keys(editItem.storeStocks).forEach(storeId => {
      if (editItem.storeStocks[storeId]) {
        storeStock[storeId] = Number(editItem.storeStocks[storeId]);
      }
    });
    
    const brandRow = editItem.brandId ? brands.find(b => b.id === editItem.brandId) : null;
    updateMenuItem(editingItem.id, {
      name: editItem.name,
      price: editItem.isPrompt ? 0 : Number(editItem.price),
      category: editItem.category,
      preparationTime: editItem.isPrompt ? 998 : (editItem.isVariable ? 999 : 10),
      stock: editItem.stock ? Number(editItem.stock) : undefined,
      storeStock: Object.keys(storeStock).length > 0 ? storeStock : undefined,
      stockAlertThreshold: editItem.stockAlertThreshold ? Number(editItem.stockAlertThreshold) : undefined,
      linkedInventoryId: editItem.linkedInventoryId || undefined,
      gramagePerUnit: editItem.gramagePerUnit ? Number(editItem.gramagePerUnit) : undefined,
      sku: editItem.sku.trim() || undefined,
      image: editItem.image || undefined,
      brandId: brandRow?.id ?? null,
      brandName: brandRow?.name,
      brandType: brandRow ? brandRow.brand_type : 'internal',
    });
    toast.success('Item updated successfully!');
    setShowEditItem(false);
    setEditingItem(null);
  };

  const openEditDialog = (item: MenuItem) => {
    setEditingItem(item);
    const storeStocks: { [key: string]: string } = {};
    if (item.storeStock) {
      Object.keys(item.storeStock).forEach(storeId => {
        storeStocks[storeId] = String(item.storeStock![storeId]);
      });
    }
    setEditItem({
      name: item.name,
      price: String(item.price),
      category: item.category,
      stock: item.stock !== undefined ? String(item.stock) : '',
      storeStocks,
      stockAlertThreshold: item.stockAlertThreshold !== undefined ? String(item.stockAlertThreshold) : '',
      linkedInventoryId: item.linkedInventoryId || '',
      gramagePerUnit: item.gramagePerUnit !== undefined ? String(item.gramagePerUnit) : '',
      sku: item.sku || '',
      image: item.image || '',
      isVariable: false,
      isPrompt: item.preparationTime === 998 || item.preparationTime === 999,
      brandId: item.brandId || '',
    });
    setShowEditItem(true);
  };

  const openBarcodeDialog = (item: MenuItem) => {
    setBarcodeMenuItem(item);
    setShowBarcodeDialog(true);
  };

  // Quick inline stock update
  const handleQuickStockUpdate = (itemId: string, newStock: number) => {
    if (newStock >= 0) {
      updateMenuItem(itemId, { stock: newStock });
      toast.success('Stock updated!');
    }
    setEditingStockId(null);
    setTempStock('');
  };

  const startEditingStock = (item: MenuItem) => {
    const storeStock = activeStore && item.storeStock?.[activeStore.id];
    const currentStock = storeStock !== undefined ? storeStock : item.stock;
    setEditingStockId(item.id);
    setTempStock(currentStock !== undefined ? String(currentStock) : '100');
  };

  const openRecipeDialog = (item: MenuItem) => {
    setRecipeMenuItem(item);
    setShowRecipeDialog(true);
  };

  const openVariationDialog = (item: MenuItem) => {
    setVariationMenuItem(item);
    setShowVariationDialog(true);
  };

  const handleSaveRecipe = (ingredients: MenuItemIngredient[]) => {
    if (recipeMenuItem) {
      updateMenuItem(recipeMenuItem.id, { ingredients });
      setRecipeMenuItem(null);
    }
  };

  const handleSaveVariations = (variations: MenuItemVariation[]) => {
    if (variationMenuItem) {
      updateMenuItem(variationMenuItem.id, { variations });
      setVariationMenuItem(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header with Back Button and Store Selector */}
      <div className="flex items-center justify-between gap-4 mb-2">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Menu Management</h1>
            <p className="text-muted-foreground">Add and manage menu items</p>
          </div>
        </div>
      </div>
      <BulkMenuUpload
        isOpen={showBulkUpload}
        onClose={() => setShowBulkUpload(false)}
        onItemsImported={handleBulkImport}
      />

      {/* Add Item Dialog */}
      {showAddItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl w-full max-w-md p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold">Add New Item</h2>
              <button onClick={() => setShowAddItem(false)} className="p-2 hover:bg-secondary rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto pr-1 space-y-4">
              <Input
                placeholder="Item Name"
                value={newItem.name}
                onChange={(e) => setNewItem(prev => ({ ...prev, name: e.target.value }))}
              />
              <MenuImageUpload imageUrl={newItemImage} onImageChange={setNewItemImage} />
              <Input
                type="number"
                placeholder={newItem.isPrompt ? "Dynamic Price (Prompt on Selection)" : "Price"}
                value={newItem.isPrompt ? "" : newItem.price}
                onChange={(e) => setNewItem(prev => ({ ...prev, price: e.target.value }))}
                disabled={newItem.isPrompt}
              />
              <select
                value={newItem.category}
                onChange={(e) => {
                  if (e.target.value === 'add_new_category') {
                    setCategorySource('new');
                    setNewCategoryName('');
                    setNewCategoryIcon('🍽️');
                    setShowAddCategory(true);
                  } else {
                    setNewItem(prev => ({ ...prev, category: e.target.value }));
                  }
                }}
                className="w-full p-3 bg-secondary rounded-lg border-none"
              >
                <option value="" disabled>Select Category</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
                ))}
                <option value="add_new_category">+ Add Category</option>
              </select>
              
              {/* SKU/Barcode Field */}
              <div className="flex items-center gap-2">
                <Barcode className="w-5 h-5 text-muted-foreground" />
                <Input
                  placeholder="SKU / Barcode (optional)"
                  value={newItem.sku}
                  onChange={(e) => setNewItem(prev => ({ ...prev, sku: e.target.value.toUpperCase() }))}
                  className="font-mono"
                />
              </div>

              {/* Variable Price/Weight Toggle */}
              {/* Variable Price/Weight Toggle */}
              <div className="flex items-center gap-2 pt-1 pb-1">
                <input
                  type="checkbox"
                  id="new-item-is-prompt"
                  checked={newItem.isPrompt}
                  onChange={(e) => setNewItem(prev => ({ 
                    ...prev, 
                    isPrompt: e.target.checked,
                    isVariable: false
                  }))}
                  className="w-4 h-4 rounded border-border accent-primary cursor-pointer"
                />
                <label htmlFor="new-item-is-prompt" className="text-sm font-medium text-foreground cursor-pointer select-none">
                  Variable Item (Prompt for Price & Weight on Selection)
                </label>
              </div>
              
              {/* Inventory linking moved to Inventory → Recipes */}


              {/* Brand (optional) */}
              <div className="border-t border-border pt-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Tag className="w-4 h-4" />
                  <span>Brand <span className="text-xs text-muted-foreground font-normal">(optional)</span></span>
                </div>
                <select
                  value={newItem.brandId}
                  onChange={(e) => setNewItem(prev => ({ ...prev, brandId: e.target.value }))}
                  className="w-full p-3 bg-secondary rounded-lg border-none"
                >
                  <option value="">-- House Brand (default) --</option>
                  {brands.map(b => (
                    <option key={b.id} value={b.id}>{b.name} • {b.brand_type}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Leave blank for your own / house items. Manage brands at <span className="font-medium">Reports → Brand Master</span>.
                </p>
              </div>

              <Button onClick={handleAddItem} className="w-full">
                <Plus className="w-4 h-4 mr-2" /> Add Item
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Item Dialog */}
      {showEditItem && editingItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl w-full max-w-md p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold">Edit Item</h2>
              <button onClick={() => setShowEditItem(false)} className="p-2 hover:bg-secondary rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto pr-1 space-y-4">
              <Input
                placeholder="Item Name"
                value={editItem.name}
                onChange={(e) => setEditItem(prev => ({ ...prev, name: e.target.value }))}
              />
              <MenuImageUpload imageUrl={editItem.image} onImageChange={(url) => setEditItem(prev => ({ ...prev, image: url }))} />
              <Input
                type="number"
                placeholder={editItem.isPrompt ? "Dynamic Price (Prompt on Selection)" : "Price"}
                value={editItem.isPrompt ? "" : editItem.price}
                onChange={(e) => setEditItem(prev => ({ ...prev, price: e.target.value }))}
                disabled={editItem.isPrompt}
              />
              <select
                value={editItem.category}
                onChange={(e) => {
                  if (e.target.value === 'add_new_category') {
                    setCategorySource('edit');
                    setNewCategoryName('');
                    setNewCategoryIcon('🍽️');
                    setShowAddCategory(true);
                  } else {
                    setEditItem(prev => ({ ...prev, category: e.target.value }));
                  }
                }}
                className="w-full p-3 bg-secondary rounded-lg border-none"
              >
                <option value="" disabled>Select Category</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
                ))}
                <option value="add_new_category">+ Add Category</option>
              </select>
              
              {/* Inventory linking moved to Inventory → Recipes */}

              {/* SKU/Barcode Field */}
              <div className="border-t border-border pt-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Barcode className="w-4 h-4" />
                  <span>SKU / Barcode</span>
                </div>
                <Input
                  placeholder="Enter SKU or barcode value"
                  value={editItem.sku}
                  onChange={(e) => setEditItem(prev => ({ ...prev, sku: e.target.value.toUpperCase() }))}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Used for barcode scanning. Leave empty to auto-generate from item ID.
                </p>

                {/* Variable Price/Weight Toggle */}
                <div className="flex items-center gap-2 pt-1 pb-1">
                  <input
                    type="checkbox"
                    id="edit-item-is-prompt"
                    checked={editItem.isPrompt}
                    onChange={(e) => setEditItem(prev => ({ 
                      ...prev, 
                      isPrompt: e.target.checked,
                      isVariable: false
                    }))}
                    className="w-4 h-4 rounded border-border accent-primary cursor-pointer"
                  />
                  <label htmlFor="edit-item-is-prompt" className="text-sm font-medium text-foreground cursor-pointer select-none">
                    Variable Item (Prompt for Price & Weight on Selection)
                  </label>
                </div>
              </div>

              {/* Brand (optional) */}
              <div className="border-t border-border pt-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Tag className="w-4 h-4" />
                  <span>Brand <span className="text-xs text-muted-foreground font-normal">(optional)</span></span>
                </div>
                <select
                  value={editItem.brandId}
                  onChange={(e) => setEditItem(prev => ({ ...prev, brandId: e.target.value }))}
                  className="w-full p-3 bg-secondary rounded-lg border-none"
                >
                  <option value="">-- House Brand (default) --</option>
                  {brands.map(b => (
                    <option key={b.id} value={b.id}>{b.name} • {b.brand_type}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Leave blank to report this item under your House Brand. Add new brands at <span className="font-medium">Reports → Brand Master</span>.
                </p>
              </div>

              <Button onClick={handleEditItem} className="w-full">
                <Edit className="w-4 h-4 mr-2" /> Update Item
              </Button>
            </div>
          </div>
        </div>
      )}


      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Menu Management</h1>
          <p className="text-muted-foreground">Toggle items on/off and manage your menu</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button 
            onClick={() => {
              syncCategoriesFromMenu();
              toast.success('Categories synced from menu items!');
            }}
            className="pos-btn-secondary px-4 py-2 flex items-center gap-2"
          >
            <RefreshCw className="w-5 h-5" />
            Sync Categories
          </button>
          <button 
            onClick={() => setShowBulkUpload(true)}
            className="pos-btn-secondary px-4 py-2 flex items-center gap-2"
          >
            <Upload className="w-5 h-5" />
            Bulk Upload
          </button>
          <button 
            onClick={() => { setEditingAddonId(null); setAddonForm({ name: '', price: '', category: '' }); setShowAddonsManager(true); }}
            className="pos-btn-secondary px-4 py-2 flex items-center gap-2"
          >
            <PlusCircle className="w-5 h-5" />
            Add Addons
          </button>
          <button 
            onClick={() => setShowAddItem(true)}
            className="pos-btn-primary px-4 py-2 flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Add Item
          </button>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search menu items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pos-input pl-10"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveCategory('all')}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all',
              activeCategory === 'all'
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-secondary-foreground hover:bg-muted'
            )}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all',
                activeCategory === cat.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-muted'
              )}
            >
              {cat.icon} {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Menu Items Table */}
      <div className="pos-card overflow-hidden overflow-x-auto">
        <table className="w-full">
          <thead className="bg-secondary">
            <tr>
              <th className="text-left p-4 text-muted-foreground font-medium">Item</th>
              <th className="text-left p-4 text-muted-foreground font-medium">Category</th>
              <th className="text-right p-4 text-muted-foreground font-medium">Price</th>
              <th className="text-center p-4 text-muted-foreground font-medium">Variations</th>
              <th className="text-center p-4 text-muted-foreground font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredItems.map((item) => {
              const category = categories.find(c => c.id === item.category);
              // Get store-specific stock if available, otherwise use global stock
              const storeStock = activeStore && item.storeStock?.[activeStore.id];
              const displayStock = storeStock !== undefined ? storeStock : item.stock;
              return (
                <tr key={item.id} className="hover:bg-secondary/50 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center text-2xl">
                        {category?.icon || '📦'}
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{item.name}</p>
                        {item.nameHindi && (
                          <p className="text-sm text-muted-foreground">{item.nameHindi}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className="px-3 py-1 bg-secondary rounded-full text-sm">
                      {category?.name || item.category}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <span className="font-semibold text-primary">{formatCurrency(item.price)}</span>
                  </td>
                  <td className="p-4 text-center">
                    <button
                      onClick={() => openVariationDialog(item)}
                      className={cn(
                        "px-3 py-1 rounded-full text-sm font-medium inline-flex items-center gap-1 transition-all hover:ring-2 hover:ring-primary/50",
                        item.variations && item.variations.length > 0
                          ? "bg-primary/20 text-primary"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      <Package className="w-3 h-3" />
                      {item.variations && item.variations.length > 0
                        ? `${item.variations.length} options`
                        : "Add"}
                    </button>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center justify-center gap-2">
                      <button 
                        onClick={() => openBarcodeDialog(item)}
                        className="p-2 hover:bg-muted rounded-lg transition-colors"
                        title="Print Barcode"
                      >
                        <Printer className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button 
                        onClick={() => openEditDialog(item)}
                        className="p-2 hover:bg-muted rounded-lg transition-colors"
                      >
                        <Edit className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button 
                        onClick={() => {
                          deleteMenuItem(item.id);
                          toast.success('Item deleted');
                        }}
                        className="p-2 hover:bg-destructive/10 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filteredItems.length === 0 && (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">📦</div>
          <p className="text-muted-foreground">No items found</p>
        </div>
      )}


      <VariationManagementDialog
        open={showVariationDialog}
        onOpenChange={setShowVariationDialog}
        menuItem={variationMenuItem}
        onSave={handleSaveVariations}
      />

      <BarcodePrintDialog
        open={showBarcodeDialog}
        onOpenChange={setShowBarcodeDialog}
        menuItem={barcodeMenuItem}
      />

      {/* Addons Manager Dialog */}
      {showAddonsManager && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-card rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-xl border border-border">
            <div className="flex justify-between items-center p-6 border-b border-border">
              <div>
                <h3 className="text-lg font-bold">Addons</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Manage addons separately from menu items
                </p>
              </div>
              <button onClick={() => setShowAddonsManager(false)} className="p-2 hover:bg-secondary rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 border-b border-border bg-secondary/30">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                <input
                  type="text"
                  placeholder="Addon name *"
                  value={addonForm.name}
                  onChange={(e) => setAddonForm({ ...addonForm, name: e.target.value })}
                  className="pos-input"
                />
                <input
                  type="number"
                  placeholder="Price *"
                  value={addonForm.price}
                  onChange={(e) => setAddonForm({ ...addonForm, price: e.target.value })}
                  className="pos-input"
                />
                <input
                  type="text"
                  placeholder="Category (optional)"
                  value={addonForm.category}
                  onChange={(e) => setAddonForm({ ...addonForm, category: e.target.value })}
                  className="pos-input"
                />
              </div>
              <div className="flex gap-2 justify-end">
                {editingAddonId && (
                  <button
                    onClick={() => { setEditingAddonId(null); setAddonForm({ name: '', price: '', category: '' }); }}
                    className="pos-btn-secondary px-4 py-2"
                  >
                    Cancel Edit
                  </button>
                )}
                <button onClick={handleSaveAddon} className="pos-btn-primary px-4 py-2 flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  {editingAddonId ? 'Update Addon' : 'Add Addon'}
                </button>
              </div>
            </div>

            <div className="p-6 flex-1 overflow-y-auto">
              {addons.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No addons yet. Add your first addon above.
                </p>
              ) : (
                <div className="space-y-2">
                  {addons.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border hover:bg-secondary/50"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{a.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatCurrency(a.price)}
                          {a.category && <span> • {a.category}</span>}
                        </p>
                      </div>
                      <button
                        onClick={() => toggleAddonAvailable(a)}
                        className="text-xs px-2 py-1 rounded-md"
                        title="Toggle availability"
                      >
                        {a.isAvailable ? (
                          <span className="text-success flex items-center gap-1"><ToggleRight className="w-5 h-5" /> Available</span>
                        ) : (
                          <span className="text-muted-foreground flex items-center gap-1"><ToggleLeft className="w-5 h-5" /> Off</span>
                        )}
                      </button>
                      <button
                        onClick={() => handleEditAddon(a)}
                        className="p-2 hover:bg-muted rounded-lg"
                        title="Edit"
                      >
                        <Edit className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => handleDeleteAddon(a.id)}
                        className="p-2 hover:bg-destructive/10 rounded-lg"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 p-6 border-t border-border">
              <button onClick={() => setShowAddonsManager(false)} className="pos-btn-secondary px-4 py-2">
                Close
              </button>
            </div>
          </div>
        </div>
      )}




      {showAddCategory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-card rounded-xl w-full max-w-sm p-6 space-y-4 shadow-xl border border-border">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold">Add Category</h3>
              <button 
                onClick={() => {
                  setShowAddCategory(false);
                  // Reset select fields to default category or empty so they aren't stuck on "add_new_category"
                  if (categorySource === 'new') {
                    setNewItem(prev => ({ ...prev, category: categories[0]?.id || 'general' }));
                  } else {
                    setEditItem(prev => ({ ...prev, category: editingItem?.category || categories[0]?.id || 'general' }));
                  }
                }} 
                className="p-2 hover:bg-secondary rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <Input
                placeholder="Category Name (e.g., Drinks)"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
              />
              <Input
                placeholder="Category Icon/Emoji (e.g., 🍹)"
                value={newCategoryIcon}
                onChange={(e) => setNewCategoryIcon(e.target.value)}
              />
            </div>
            <Button 
              onClick={handleCreateCategory} 
              className="w-full"
              disabled={!newCategoryName.trim()}
            >
              Add Category
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
