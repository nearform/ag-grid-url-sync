import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    const isSource = /\.tsx?$/.test(entry.name)
    const isTest = /\.test(-d)?\.tsx?$/.test(entry.name)
    return isSource && !isTest ? [path] : []
  })
}

// Runtime imports only: tsc erases `import type` and `export type`
const RUNTIME_IMPORT =
  /^(?:import|export)\s+(?!type\b)[^'"]*?from\s+['"](\.{1,2}\/[^'"]+)['"]/gm

function resolveImport(fromFile: string, specifier: string): string {
  const base = resolve(dirname(fromFile), specifier.replace(/\.js$/, ''))
  const match = ['.ts', '.tsx'].map(ext => base + ext).find(existsSync)
  if (!match) throw new Error(`Cannot resolve ${specifier} from ${fromFile}`)
  return match
}

function buildGraph(): Map<string, string[]> {
  const graph = new Map<string, string[]>()
  for (const file of sourceFiles(SRC)) {
    const source = readFileSync(file, 'utf8')
    const imports = [...source.matchAll(RUNTIME_IMPORT)].map(match =>
      resolveImport(file, match[1]!)
    )
    graph.set(file, imports)
  }
  return graph
}

function findCycle(graph: Map<string, string[]>): string[] | null {
  const state = new Map<string, 'visiting' | 'done'>()
  const stack: string[] = []

  const visit = (node: string): string[] | null => {
    if (state.get(node) === 'done') return null
    if (state.get(node) === 'visiting') {
      return [...stack.slice(stack.indexOf(node)), node]
    }
    state.set(node, 'visiting')
    stack.push(node)
    for (const dependency of graph.get(node) ?? []) {
      const cycle = visit(dependency)
      if (cycle) return cycle
    }
    stack.pop()
    state.set(node, 'done')
    return null
  }

  for (const node of graph.keys()) {
    const cycle = visit(node)
    if (cycle) return cycle
  }
  return null
}

const toRelative = (file: string): string => relative(SRC, file)

describe('source module graph', () => {
  const graph = buildGraph()

  it('reads runtime imports', () => {
    const grouped = join(SRC, 'core/serialization/grouped.ts')
    expect(graph.get(grouped)?.map(toRelative)).toContain(
      'core/serialization/formats.ts'
    )
  })

  it('has no circular runtime imports (#202)', () => {
    const cycle = findCycle(graph)
    expect(cycle?.map(toRelative).join(' -> ') ?? null).toBeNull()
  })
})
