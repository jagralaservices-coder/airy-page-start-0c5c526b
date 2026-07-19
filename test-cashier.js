import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);

async function test() {
  const { data: stores } = await supabase.from('stores').select('id, name');
  console.log('Stores:', stores);
  if (!stores || stores.length === 0) return;

  const storeId = stores[0].id;

  // Let's find cashiers
  const { data: cashiers } = await supabase.from('cashiers').select('*').eq('store_id', storeId);
  console.log('Cashiers:', cashiers);

  if (cashiers && cashiers.length > 0) {
    const c = cashiers[0];
    console.log(`Testing cashier_verify_pin for ${c.cashier_code} with PIN 123456...`);
    const { data, error } = await supabase.rpc('cashier_verify_pin', {
      _store_id: storeId,
      _identifier: c.cashier_code,
      _pin: '123456'
    });
    console.log('Result:', data, error);
  }
}
test();
