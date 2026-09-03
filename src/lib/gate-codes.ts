import { randomInt } from 'node:crypto'
import { ENTRY_CODE_ALPHABET, ENTRY_CODE_LENGTH } from './gate'

/**
 * Entry-code generation. Server-only: it needs `node:crypto`, and a code the
 * browser could predict would let anyone walk in.
 *
 * The rest of the gate rules — validation, formatting, phone matching — are in
 * `gate.ts` and safe to import anywhere.
 */
export function generateEntryCode(): string {
  let code = ''
  for (let index = 0; index < ENTRY_CODE_LENGTH; index += 1) {
    code += ENTRY_CODE_ALPHABET[randomInt(0, ENTRY_CODE_ALPHABET.length)]
  }
  return code
}
