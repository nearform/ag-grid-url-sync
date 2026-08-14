#!/usr/bin/env node
/**
 * Per-file gzip budgets for individual emitted modules.
 *
 * Complements `size-limit`, which measures the two public entry points bundled
 * with their dependencies — the number a consumer actually pays. This checks the
 * opposite axis: has any single module grown? size-limit cannot express both in
 * one config, because its esbuild step always bundles, which makes sibling
 * modules that share a dependency closure report identical sizes.
 *
 * This is what `bundlesize` used to measure, minus its dependency on the
 * deprecated iltorb native addon. Budgets live under `fileSizeBudgets` in
 * package.json.
 */
import { gzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Parses "2.5KB" / "900B" into bytes, treating KB as 1000 to match size-limit. */
function parseSize(text) {
  const match = /^([\d.]+)\s*(B|KB)$/i.exec(text.trim())
  if (!match) {
    throw new Error(`Unparseable budget "${text}" (expected e.g. "2.5KB")`)
  }
  const value = Number(match[1])
  return match[2].toUpperCase() === 'KB' ? Math.round(value * 1000) : value
}

const { fileSizeBudgets } = JSON.parse(
  readFileSync(join(ROOT, 'package.json'), 'utf8')
)

if (!Array.isArray(fileSizeBudgets) || fileSizeBudgets.length === 0) {
  console.error('No fileSizeBudgets configured in package.json')
  process.exit(1)
}

const failures = []
const rows = []

for (const { path, maxSize } of fileSizeBudgets) {
  const limit = parseSize(maxSize)

  let contents
  try {
    contents = readFileSync(join(ROOT, path))
  } catch {
    // A renamed or deleted file must fail loudly. Silently skipping a missing
    // budget is how a size guard quietly stops guarding anything.
    failures.push(`${path}: MISSING (budget ${maxSize})`)
    rows.push([path, 'MISSING', maxSize, '✖'])
    continue
  }

  const size = gzipSync(contents, { level: 9 }).length
  const ok = size <= limit
  if (!ok) {
    failures.push(`${path}: ${size} B gzip exceeds ${maxSize} (${limit} B)`)
  }
  rows.push([path, `${size} B`, maxSize, ok ? '✔' : '✖'])
}

const width = Math.max(...rows.map(([path]) => path.length))
console.log('\n  Per-file gzip budgets\n')
for (const [path, size, max, mark] of rows) {
  console.log(
    `  ${mark} ${path.padEnd(width)}  ${size.padStart(8)}  limit ${max}`
  )
}
console.log()

if (failures.length > 0) {
  console.error(
    `Per-file size budget exceeded:\n${failures.map(f => `  - ${f}`).join('\n')}\n`
  )
  process.exit(1)
}
