'use client'

import { useState } from 'react'

/**
 * A numeric input that can actually be typed into.
 *
 * The obvious version — `value={n}` with `onChange={e => setN(Number(e.target.value))}` —
 * fights the person using it. Clearing the box gives `Number('') === 0`, so a
 * `0` reappears under the cursor and the next digit lands after it: emptying
 * the field and typing `12` produces `012`. A minus sign is worse, because
 * `Number('-')` is `NaN`, and the field either blanks or freezes halfway
 * through typing `-1`.
 *
 * So the input keeps the raw string — which is what an input holds anyway —
 * and the number is derived from it. Half-typed states like `''` and `'-'`
 * are legal while typing and simply read as the fallback.
 */
export function useNumberField(initial: number, fallback = initial) {
  const [text, setText] = useState(String(initial))

  const parsed = Number(text)
  const value = text.trim() === '' || Number.isNaN(parsed) ? fallback : parsed

  return {
    /** Spread onto the input. */
    props: {
      value: text,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
        setText(event.target.value),
      inputMode: 'numeric' as const,
    },
    /** The number to compute with. */
    value,
    /** The raw text, for posting to a server action that coerces anyway. */
    text,
    set: (next: number) => setText(String(next)),
  }
}
