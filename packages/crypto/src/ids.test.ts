import { beforeAll, describe, expect, it } from 'vitest';
import { isId, newId, ready } from './index.ts';

beforeAll(ready);

describe('ids', () => {
  it('newId is 32 lowercase hex characters', () => {
    expect(newId()).toMatch(/^[0-9a-f]{32}$/);
  });

  it('newId does not repeat', () => {
    const ids = new Set(Array.from({ length: 1000 }, newId));
    expect(ids.size).toBe(1000);
  });

  it('isId accepts only 32 lowercase hex characters', () => {
    expect(isId('0123456789abcdef0123456789abcdef')).toBe(true);
    expect(isId('0123456789ABCDEF0123456789ABCDEF')).toBe(false);
    expect(isId('0'.repeat(31))).toBe(false);
    expect(isId('0'.repeat(33))).toBe(false);
    expect(isId('g'.repeat(32))).toBe(false);
    expect(isId('')).toBe(false);
  });
});
