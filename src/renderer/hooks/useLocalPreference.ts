import { useState, useCallback } from 'react';

/**
 * Persist a UI preference in localStorage with the `pocketchart:` prefix.
 * Returns a React state value + setter that keeps localStorage in sync.
 */
export function useLocalPreference<T>(
  key: string,
  defaultValue: T
): [T, (val: T | ((prev: T) => T)) => void] {
  const prefixedKey = `pocketchart:${key}`;

  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(prefixedKey);
      if (stored === null) return defaultValue;
      return JSON.parse(stored) as T;
    } catch {
      return defaultValue;
    }
  });

  const set = useCallback(
    (valOrFn: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const next = typeof valOrFn === 'function' ? (valOrFn as (p: T) => T)(prev) : valOrFn;
        try {
          localStorage.setItem(prefixedKey, JSON.stringify(next));
        } catch {
          // quota exceeded — silently ignore
        }
        return next;
      });
    },
    [prefixedKey]
  );

  return [value, set];
}
