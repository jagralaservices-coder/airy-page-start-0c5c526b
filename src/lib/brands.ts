import { supabase } from '@/integrations/supabase/client';

export interface Brand {
  id: string;
  store_id: string;
  merchant_id?: string | null;
  name: string;
  brand_type: 'internal' | 'external';
  description?: string | null;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

export const listBrands = async (storeIds: string[]): Promise<Brand[]> => {
  if (storeIds.length === 0) return [];
  const { data, error } = await (supabase as any)
    .from('brands')
    .select('*')
    .in('store_id', storeIds)
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Brand[];
};

export const createBrand = async (input: Partial<Brand> & { store_id: string; name: string }) => {
  const { data, error } = await (supabase as any)
    .from('brands')
    .insert({
      store_id: input.store_id,
      merchant_id: input.merchant_id ?? null,
      name: input.name.trim(),
      brand_type: input.brand_type ?? 'external',
      description: input.description ?? null,
      status: input.status ?? 'active',
    })
    .select()
    .single();
  if (error) throw error;
  return data as Brand;
};

export const updateBrand = async (id: string, patch: Partial<Brand>) => {
  const { data, error } = await (supabase as any)
    .from('brands')
    .update({
      name: patch.name?.trim(),
      brand_type: patch.brand_type,
      description: patch.description ?? null,
      status: patch.status,
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as Brand;
};

export const deleteBrand = async (id: string) => {
  const { error } = await (supabase as any).from('brands').delete().eq('id', id);
  if (error) throw error;
};

export const toggleBrandStatus = async (id: string, status: 'active' | 'inactive') => {
  return updateBrand(id, { status });
};
