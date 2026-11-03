import { defineConfig } from 'oxlint'

export default defineConfig({
  plugins: ['typescript', 'unicorn', 'oxc', 'import', 'react'],
  categories: {
    correctness: 'error'
  },
  env: {
    builtin: true,
    browser: true,
    node: true
  },
  ignorePatterns: [
    'dist/**',
    'coverage/**',
    // Local agent tooling
    '.agent/**',
    '.agents/**',
    '.claude/**',
    '.codex/**',
    '.continue/**',
    '.cursor/**',
    '.gemini/**',
    '.opencode/**',
    '.pi/**',
    '.roo/**',
    '.windsurf/**',
    // Vendored anti-slop plugin (see tools/oxlint/anti-slop/UPSTREAM.md)
    'tools/oxlint/anti-slop/**'
  ],
  jsPlugins: [
    { name: 'anti-slop', specifier: './tools/oxlint/anti-slop/index.ts' }
  ],
  rules: {
    // The import cycle from #202 must not return
    'import/no-cycle': 'error',

    // anti-slop (https://github.com/dmmulroy/anti-slop), manual installation
    'oxc/no-accumulating-spread': 'error',
    'anti-slop/no-array-filter-map': 'error',
    'anti-slop/no-reduce-accumulator-copy': 'error',
    'anti-slop/no-conditional-empty-object-spread': 'error',
    'anti-slop/no-known-value-widening': 'error',
    'anti-slop/no-object-parameters': 'error',
    'anti-slop/no-reflect-apply': 'error',
    'anti-slop/no-reflect-get': 'error',
    'anti-slop/no-shape-in-symbol-names': 'error',
    'anti-slop/no-unknown-parameters': 'error',
    'anti-slop/no-unknown-returns': 'error',
    'anti-slop/no-unknown-type-aliases': 'error',
    'anti-slop/no-unsafe-dictionary-type': 'error',
    'anti-slop/no-widen-then-assert': 'error',
    'anti-slop/require-readable-spacing': 'error',
    'anti-slop/no-module-mocking': 'error',
    'anti-slop/no-runtime-typeof': 'error',
    'anti-slop/no-chained-type-assertions': 'error',
    'anti-slop/require-safety-comment-for-type-assertion': 'error'
  }
})
