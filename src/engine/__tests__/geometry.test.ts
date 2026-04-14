import { describe, it, expect } from 'vitest';
import { manhattan, chebyshev } from '../geometry';

describe('manhattan', () => {
  it('returns 0 for same point', () => {
    expect(manhattan({ x: 5, y: 3 }, { x: 5, y: 3 })).toBe(0);
  });

  it('returns correct distance for horizontal offset', () => {
    expect(manhattan({ x: 0, y: 0 }, { x: 4, y: 0 })).toBe(4);
  });

  it('returns correct distance for vertical offset', () => {
    expect(manhattan({ x: 0, y: 0 }, { x: 0, y: 7 })).toBe(7);
  });

  it('returns correct distance for diagonal offset', () => {
    expect(manhattan({ x: 1, y: 2 }, { x: 4, y: 6 })).toBe(7); // |3| + |4|
  });

  it('is symmetric', () => {
    const a = { x: 3, y: 1 };
    const b = { x: 8, y: 5 };
    expect(manhattan(a, b)).toBe(manhattan(b, a));
  });

  it('handles negative coordinates', () => {
    expect(manhattan({ x: -2, y: -3 }, { x: 2, y: 3 })).toBe(10);
  });
});

describe('chebyshev', () => {
  it('returns 0 for same point', () => {
    expect(chebyshev({ x: 5, y: 3 }, { x: 5, y: 3 })).toBe(0);
  });

  it('returns correct distance for horizontal offset', () => {
    expect(chebyshev({ x: 0, y: 0 }, { x: 4, y: 0 })).toBe(4);
  });

  it('returns correct distance for vertical offset', () => {
    expect(chebyshev({ x: 0, y: 0 }, { x: 0, y: 7 })).toBe(7);
  });

  it('returns max of axes for diagonal offset', () => {
    expect(chebyshev({ x: 1, y: 2 }, { x: 4, y: 6 })).toBe(4); // max(|3|, |4|)
  });

  it('is symmetric', () => {
    const a = { x: 3, y: 1 };
    const b = { x: 8, y: 5 };
    expect(chebyshev(a, b)).toBe(chebyshev(b, a));
  });

  it('equals manhattan for axis-aligned points', () => {
    expect(chebyshev({ x: 0, y: 0 }, { x: 5, y: 0 })).toBe(
      manhattan({ x: 0, y: 0 }, { x: 5, y: 0 })
    );
  });

  it('handles negative coordinates', () => {
    expect(chebyshev({ x: -2, y: -3 }, { x: 2, y: 3 })).toBe(6); // max(4, 6)
  });
});
