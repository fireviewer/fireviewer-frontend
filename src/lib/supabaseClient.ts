import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseBrowserEnvironment {
  readonly VITE_SUPABASE_URL?: unknown;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: unknown;
}

let singleton: SupabaseClient | null | undefined;

function runtimeEnvironment(): SupabaseBrowserEnvironment {
  return import.meta.env as SupabaseBrowserEnvironment;
}

export function resolveSupabaseBrowserConfig(
  environment: SupabaseBrowserEnvironment = runtimeEnvironment(),
): { readonly url: string; readonly publishableKey: string } | null {
  const rawUrl = environment.VITE_SUPABASE_URL;
  const rawKey = environment.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (typeof rawUrl !== 'string' || typeof rawKey !== 'string') return null;
  if (rawUrl !== rawUrl.trim() || rawKey !== rawKey.trim() || !rawKey.startsWith('sb_publishable_')) return null;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
    return { url: url.origin, publishableKey: rawKey };
  } catch {
    return null;
  }
}

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (singleton !== undefined) return singleton;
  const config = resolveSupabaseBrowserConfig();
  singleton = config
    ? createClient(config.url, config.publishableKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'pkce',
        },
      })
    : null;
  return singleton;
}

export function resetSupabaseClientForTests(): void {
  singleton = undefined;
}
