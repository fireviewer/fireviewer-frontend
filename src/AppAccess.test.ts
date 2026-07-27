import { describe, expect, it } from 'vitest';
import { isPublicAccessLocked } from './App';

describe('verrouillage temporaire de l’interface publique', () => {
  it('est actif uniquement dans le build de production', () => {
    expect(isPublicAccessLocked({ PROD: true })).toBe(true);
    expect(isPublicAccessLocked({ PROD: false })).toBe(false);
  });
});
