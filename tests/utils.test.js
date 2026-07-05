import { describe, it, expect, vi } from 'vitest';
import { showToast, vibrate } from '../js/utils.js';

describe('Utils', () => {
  it('should not throw when vibrating in a standard environment', () => {
    expect(() => vibrate([50])).not.toThrow();
  });
});
