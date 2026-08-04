import { describe, expect, it } from 'vitest';
import type { User } from '@supabase/supabase-js';

import { canPublishFromRoles, isVerifiedSupabaseUser, rolesFromAppMetadata } from './SupabaseAuthContext';

function user(value: Partial<User>): User {
  return value as User;
}

describe('Supabase Auth authorization helpers', () => {
  it('ne lit les rôles élevés que depuis app_metadata', () => {
    expect(rolesFromAppMetadata(user({
      app_metadata: { roles: ['analyst', 'editor', 'unknown'] },
      user_metadata: { roles: ['administrator'] },
    }))).toEqual(['analyst', 'editor']);
    expect(rolesFromAppMetadata(user({
      app_metadata: {},
      user_metadata: { roles: ['administrator'] },
    }))).toEqual([]);
  });

  it('exige une adresse confirmée pour contribuer', () => {
    expect(isVerifiedSupabaseUser(user({ email: 'person@example.test', email_confirmed_at: '2026-08-03T12:00:00Z' }))).toBe(true);
    expect(isVerifiedSupabaseUser(user({ email: 'person@example.test' }))).toBe(false);
  });

  it('réserve la publication aux éditeurs et administrateurs', () => {
    expect(canPublishFromRoles(['analyst'])).toBe(false);
    expect(canPublishFromRoles(['editor'])).toBe(true);
    expect(canPublishFromRoles(['analyst', 'editor'])).toBe(true);
    expect(canPublishFromRoles(['administrator'])).toBe(true);
  });
});
