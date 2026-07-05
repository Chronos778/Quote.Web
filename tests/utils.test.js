import { describe, it, expect } from 'vitest';
import { vibrate } from '../js/utils.js';

describe('Utils', () => {
  it('should not throw when vibrating in a standard environment', () => {
    expect(() => vibrate([50])).not.toThrow();
  });
});
