/**
 * Architectural checks over the source tree.
 *
 * These are the mistakes that pass typecheck, pass lint, and then either
 * break the build in a confusing way or ship something that should never
 * have left the server. Each one here has already happened once in this
 * project or is one import away from happening.
 *
 *   npm run test:boundaries
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

const ROOT = path.join(process.cwd(), 'src')

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, files)
    else if (/\.(ts|tsx)$/.test(entry)) files.push(full)
  }
  return files
}

const sources = walk(ROOT).map((file) => ({
  path: path.relative(process.cwd(), file),
  code: readFileSync(file, 'utf8'),
}))

const clientFiles = sources.filter((file) => /^['"]use client['"]/m.test(file.code))
const serverOnlyFiles = new Set(
  sources
    .filter((file) => /^import ['"]server-only['"]/m.test(file.code))
    .map((file) => file.path.replace(/^src\//, '@/').replace(/\.tsx?$/, '')),
)

/** Runtime imports only — `import type` is erased and costs nothing. */
function runtimeImports(code: string): string[] {
  const matches = code.matchAll(/^import\s+(?!type\s)([\s\S]*?)from\s+['"]([^'"]+)['"]/gm)
  return [...matches]
    .filter((match) => !/^\s*type\s/.test(match[1] ?? ''))
    .map((match) => match[2] ?? '')
}

console.log('client and server boundary')

check('there are client components to check at all', () => {
  assert.ok(clientFiles.length > 20, `only found ${clientFiles.length} client components`)
})

check('no client component imports a server-only module', () => {
  // This is the Phase 8 bug: a rollback button imported withinRollbackWindow
  // from a module that touches node:crypto, and the build failed with a stack
  // trace about a Node builtin rather than about the import.
  for (const file of clientFiles) {
    for (const specifier of runtimeImports(file.code)) {
      assert.ok(
        !serverOnlyFiles.has(specifier),
        `${file.path} imports the server-only module ${specifier}`,
      )
    }
  }
})

check('no client component imports node builtins', () => {
  for (const file of clientFiles) {
    for (const specifier of runtimeImports(file.code)) {
      assert.ok(
        !specifier.startsWith('node:'),
        `${file.path} imports ${specifier}, which cannot run in a browser`,
      )
    }
  }
})

check('no client component pulls in a service at runtime', () => {
  // Services import server-only Supabase clients. A value import here would
  // drag the service key's code path into the browser bundle.
  for (const file of clientFiles) {
    for (const specifier of runtimeImports(file.code)) {
      assert.ok(
        !specifier.startsWith('@/services/'),
        `${file.path} imports ${specifier} at runtime; use "import type"`,
      )
    }
  }
})

check('the service-role client is never reachable from a client component', () => {
  for (const file of clientFiles) {
    assert.ok(
      !file.code.includes('supabase/admin'),
      `${file.path} references the service-role client`,
    )
  }
})

console.log('\nbundle weight')

check('zod does not ship to the browser', () => {
  // 14kB to check an email address on a public page. Validation belongs in a
  // server action; the client shows what comes back.
  for (const file of clientFiles) {
    assert.ok(
      !runtimeImports(file.code).includes('zod'),
      `${file.path} imports zod into the client bundle`,
    )
  }
})

check('pdf-lib stays on the server', () => {
  for (const file of clientFiles) {
    const specifiers = runtimeImports(file.code)
    assert.ok(!specifiers.includes('pdf-lib'), `${file.path} imports pdf-lib`)
    assert.ok(!specifiers.includes('@pdf-lib/fontkit'), `${file.path} imports fontkit`)
  }
})

console.log('\nstorage and secrets')

check('nothing uses browser storage', () => {
  // Sessions live in httpOnly cookies. A localStorage token is readable by
  // any XSS bug on the page. Comments may mention it — the rule is about
  // code, so strip comments before looking.
  for (const file of sources) {
    const code = file.code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

    assert.ok(
      !/\b(localStorage|sessionStorage)\b/.test(code),
      `${file.path} uses browser storage`,
    )
  }
})

check('no secret is read outside the server', () => {
  const secrets = [
    'SUPABASE_SERVICE_ROLE_KEY',
    'OTP_SECRET',
    'CRON_SECRET',
    'SSLCOMMERZ_STORE_PASSWORD',
    'RESEND_API_KEY',
  ]

  for (const file of clientFiles) {
    for (const secret of secrets) {
      assert.ok(!file.code.includes(secret), `${file.path} reads ${secret}`)
    }
  }
})

check('every environment variable in client code is public', () => {
  for (const file of clientFiles) {
    const used = [...file.code.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map(
      (match) => match[1],
    )
    for (const name of used) {
      assert.ok(
        name?.startsWith('NEXT_PUBLIC_') || name === 'NODE_ENV',
        `${file.path} reads ${name} in the browser`,
      )
    }
  }
})

console.log('\nsafety')

check('nothing sets HTML from a string except the JSON-LD blocks', () => {
  const allowed = ['src/app/layout.tsx', 'src/app/(marketing)/faq/page.tsx']

  for (const file of sources) {
    if (!file.code.includes('dangerouslySetInnerHTML')) continue
    assert.ok(
      allowed.includes(file.path.replace(/\\/g, '/')),
      `${file.path} sets HTML from a string`,
    )
  }
})

check('every route handler that writes has a permission or an explicit reason', () => {
  const handlers = sources.filter((file) => /src\/app\/api\/.*route\.ts$/.test(file.path))
  assert.ok(handlers.length > 5, 'expected several route handlers')

  for (const file of handlers) {
    if (!/export (async function|const) (POST|PATCH|DELETE|PUT)/.test(file.code)) continue

    const guarded =
      file.code.includes('permission:') ||
      file.code.includes('requireUser') ||
      file.code.includes('assertPermission') ||
      // The gateway webhook has no session by definition; it verifies a
      // signature instead, and says so.
      file.code.includes('verify_sign') ||
      file.code.includes('handleSslIpn')

    assert.ok(guarded, `${file.path} writes without a visible guard`)
  }
})

console.log(`\n${passed} checks passed`)
