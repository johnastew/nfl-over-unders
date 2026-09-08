// Fill these in from your Supabase project:
// Supabase dashboard → Project Settings → Data API (URL) and API Keys (anon/public key).
//
// These two values are meant to be public — they ship in the page's JavaScript and are
// safe to commit. See the README's security note for what that does and doesn't protect.
export const SUPABASE_URL = 'https://qzxohiwgpivvmdquzaow.supabase.co';
export const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

export const isConfigured =
  SUPABASE_URL.startsWith('https://') && !SUPABASE_ANON_KEY.startsWith('YOUR_');
