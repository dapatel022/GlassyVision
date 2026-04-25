import { createBrowserClient as createSsrBrowserClient } from '@supabase/ssr';
import type { Database } from './types';

let browserClient: ReturnType<typeof createSsrBrowserClient<Database>> | null = null;

export function createBrowserClient() {
  if (browserClient) return browserClient;

  browserClient = createSsrBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  return browserClient;
}
