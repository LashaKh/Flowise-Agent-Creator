/**
 * Trivial test to verify jsdom + @testing-library/react work in this project.
 * Can be removed once real hook tests exist.
 */
import { renderHook, act } from '@testing-library/react';
import { useState, useCallback } from 'react';
import { describe, it, expect } from 'vitest';

function useCounter(initial = 0) {
  const [count, setCount] = useState(initial);
  const increment = useCallback(() => setCount((c) => c + 1), []);
  return { count, increment };
}

describe('jsdom test environment', () => {
  it('renders a React hook with renderHook', () => {
    const { result } = renderHook(() => useCounter());
    expect(result.current.count).toBe(0);

    act(() => result.current.increment());
    expect(result.current.count).toBe(1);
  });
});
