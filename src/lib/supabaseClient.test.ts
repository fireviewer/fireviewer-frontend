import { describe, expect, it } from 'vitest';

import { resolveSupabaseBrowserConfig } from './supabaseClient';

describe('resolveSupabaseBrowserConfig', () => {
  it('accepte uniquement une URL HTTPS et une clé publiable', () => {
    expect(resolveSupabaseBrowserConfig({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_public-value',
    })).toEqual({
      url: 'https://example.supabase.co',
      publishableKey: 'sb_publishable_public-value',
    });
  });

  it('refuse toute clé secrète, service role ou URL ambiguë', () => {
    expect(resolveSupabaseBrowserConfig({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'not-a-publishable-key',
    })).toBeNull();
    expect(resolveSupabaseBrowserConfig({
      VITE_SUPABASE_URL: 'https://example.supabase.co/auth/v1',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_public-value',
    })).toBeNull();
  });
});
