import { describe, expect, it } from 'vitest';

import { isFeatureEnabled } from './featureFlags';

describe('isFeatureEnabled', () => {
  it('accepte uniquement la valeur exacte true sous le nom Vite explicite', () => {
    expect(isFeatureEnabled('FV_EVENT_V2_ENABLED', { VITE_FV_EVENT_V2_ENABLED: 'true' })).toBe(true);
    expect(isFeatureEnabled('FV_EVENT_V2_ENABLED', { VITE_FV_EVENT_V2_ENABLED: 'TRUE' })).toBe(false);
    expect(isFeatureEnabled('FV_EVENT_V2_ENABLED', {})).toBe(false);
  });

  it('accepte le nom canonique lorsque le runtime le fournit explicitement', () => {
    expect(isFeatureEnabled('FV_3D_PRIMARY_ENABLED', { FV_3D_PRIMARY_ENABLED: 'true' })).toBe(true);
  });
});
