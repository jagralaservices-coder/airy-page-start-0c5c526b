import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useSubscription } from '@/hooks/useSubscription';
import { emitPosEvent } from '@/lib/posEvents';


interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  category?: string;
}

/**
 * Hook to auto-deduct inventory when orders are completed.
 * Links menu items to inventory via `menu_item_ingredients` table.
 * Shows low stock alerts when items fall below min_stock.
 */
export const useInventoryDeduction = () => {
  const { canAccess } = useSubscription();
  const hasRecipeDeduction = canAccess('recipeInventory');

  /**
   * Deduct inventory for a completed order's items
   */
  const deductInventoryForOrder = useCallback(async (
    storeId: string,
    items: OrderItem[],
    orderId?: string
  ): Promise<{ success: boolean; lowStockItems: string[] }> => {
    const lowStockItems: string[] = [];

    // Plan gate: only merchants whose plan includes recipe-based deduction
    if (!hasRecipeDeduction) {
      return { success: true, lowStockItems: [] };
    }

    try {
      // Resolve merchant + current user for audit trail
      const { data: storeRow } = await supabase
        .from('stores')
        .select('merchant_id, customer_id')
        .eq('id', storeId)
        .maybeSingle();
      const merchantId = (storeRow as any)?.merchant_id || (storeRow as any)?.customer_id || null;
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id || null;

      for (const item of items) {
        const { data: ingredients, error: ingError } = await supabase
          .from('menu_item_ingredients')
          .select('inventory_item_id, quantity_required, unit')
          .eq('menu_item_id', item.id);

        if (ingError || !ingredients || ingredients.length === 0) continue;

        for (const ingredient of ingredients) {
          const { data: invItem, error: invError } = await supabase
            .from('inventory_items')
            .select('id, name, quantity, min_stock, unit')
            .eq('id', ingredient.inventory_item_id)
            .eq('store_id', storeId)
            .maybeSingle();

          if (invError || !invItem) continue;

          if (ingredient.unit && invItem.unit && ingredient.unit !== invItem.unit) {
            console.warn('[InventoryDeduction] Unit mismatch, skipping', {
              menuItem: item.id,
              inventoryItem: invItem.name,
              recipeUnit: ingredient.unit,
              stockUnit: invItem.unit,
            });
            continue;
          }

          const totalDeduction = Number(ingredient.quantity_required) * item.quantity;
          const qtyBefore = Number(invItem.quantity);
          const qtyAfter = qtyBefore - totalDeduction;

          const { error: updErr } = await supabase
            .from('inventory_items')
            .update({ quantity: qtyAfter, updated_at: new Date().toISOString() })
            .eq('id', invItem.id)
            .eq('store_id', storeId);

          if (updErr) {
            console.error('[InventoryDeduction] update failed', updErr);
            continue;
          }

          // Audit log — best-effort, never blocks the sale
          try {
            await (supabase as any).from('inventory_transactions').insert({
              inventory_item_id: invItem.id,
              store_id: storeId,
              merchant_id: merchantId,
              order_id: orderId || null,
              source: 'sale',
              qty_delta: -totalDeduction,
              qty_before: qtyBefore,
              qty_after: qtyAfter,
              unit: invItem.unit || ingredient.unit || null,
              reference: item.name,
              created_by: userId,
            });
          } catch (logErr) {
            console.warn('[InventoryDeduction] audit log failed', logErr);
          }

          if (qtyAfter <= Number(invItem.min_stock)) {
            lowStockItems.push(invItem.name);
          }
        }
      }

      if (lowStockItems.length > 0) {
        toast.warning(
          `Low Stock Alert: ${lowStockItems.slice(0, 3).join(', ')}${lowStockItems.length > 3 ? ` +${lowStockItems.length - 3} more` : ''}`,
          { duration: 6000 }
        );
      }

      return { success: true, lowStockItems };
    } catch (err) {
      console.error('[InventoryDeduction] Error:', err);
      return { success: false, lowStockItems: [] };
    }
  }, [hasRecipeDeduction]);


  /**
   * Check all inventory items for low stock
   */
  const checkLowStock = useCallback(async (storeId: string) => {
    try {
      const { data, error } = await supabase
        .from('inventory_items')
        .select('id, name, quantity, min_stock, unit')
        .eq('store_id', storeId);

      if (error || !data) return [];

      return data.filter(item => Number(item.quantity) <= Number(item.min_stock))
        .map(item => ({
          id: item.id,
          name: item.name,
          currentStock: Number(item.quantity),
          minStock: Number(item.min_stock),
          unit: item.unit,
        }));
    } catch {
      return [];
    }
  }, []);

  /**
   * Get reorder suggestions based on usage patterns
   */
  const getReorderSuggestions = useCallback(async (storeId: string) => {
    try {
      const lowItems = await checkLowStock(storeId);
      return lowItems.map(item => ({
        ...item,
        suggestedQuantity: Math.max(item.minStock * 2 - item.currentStock, item.minStock),
      }));
    } catch {
      return [];
    }
  }, [checkLowStock]);

  return {
    deductInventoryForOrder,
    checkLowStock,
    getReorderSuggestions,
  };
};
