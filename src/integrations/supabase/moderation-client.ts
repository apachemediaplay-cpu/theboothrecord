// Isolated Supabase client for the /moderate admin surface ONLY.
//
// Why a separate client: the public confess/wall flow uses ./client, whose privileges
// are granted to `anon` (create_confession → anon only; "public reads approved only"
// → anon only). If an admin's magic-link session ever attached to that client, the
// public flow would break under the authenticated JWT. This client owns its own
// storageKey so the admin session is fully isolated, and it is the ONLY client with
// detectSessionInUrl enabled — so it, not the public client, consumes the magic-link
// token off the /moderate redirect URL.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabaseModeration = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      storage: localStorage,
      storageKey: 'booth-moderate-auth',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  },
);
