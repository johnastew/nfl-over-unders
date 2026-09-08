// Supabase project URL and publishable (anon) key.
//
// Both values are meant to be public — they ship in the page's JavaScript for every
// visitor, and are safe to commit. Access is limited by the row level security policies
// in supabase-schema.sql, which this key maps to the "anon" role for.
// Never put the service_role key here: it bypasses those policies entirely.
export const SUPABASE_URL = 'https://qzxohiwgpivvmdquzaow.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_XjYFcs51IfbH69KvJW6W-Q_n-DDA_LB';

export const isConfigured =
  SUPABASE_URL.startsWith('https://') && !SUPABASE_ANON_KEY.startsWith('YOUR_');
