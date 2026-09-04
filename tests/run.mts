/**
 * Runs every TypeScript suite in one process and prints one summary.
 *
 * Thirteen `npm run` invocations spend more time starting Node than running
 * assertions. This keeps the individual scripts working — `npm run test:otp`
 * when you are changing handover codes — while `npm test` stays quick.
 */
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// .mts so this file is a module: the suites are imported dynamically, which
// a CommonJS entry point cannot do to an async module.
const HERE = path.dirname(fileURLToPath(import.meta.url))

const suites = readdirSync(HERE)
  .filter((file) => file.endsWith('.test.ts'))
  .sort()

let failed = 0
const started = Date.now()

for (const suite of suites) {
  try {
    await import(path.join(HERE, suite))
  } catch (error) {
    failed += 1
    console.error(`\n✗ ${suite}\n`, error instanceof Error ? error.message : error)
  }
}

const seconds = ((Date.now() - started) / 1000).toFixed(1)

console.log(
  failed === 0
    ? `\n${suites.length} suites passed in ${seconds}s`
    : `\n${failed} of ${suites.length} suites failed`,
)

process.exit(failed === 0 ? 0 : 1)
