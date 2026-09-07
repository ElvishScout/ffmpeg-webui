import type { AssetRef } from '../types/graph'
import type { AssetMeta } from './db'

/**
 * Rank local assets as candidates for a missing reference.
 * Exact filename+size first, then filename, then size, then same mime family.
 */
export function matchCandidates(ref: AssetRef, locals: AssetMeta[]): AssetMeta[] {
  const scored = locals.map((m) => ({ m, score: score(ref, m) }))
  return scored
    .filter((s) => s.score > 0)
    .sort((x, y) => y.score - x.score)
    .map((s) => s.m)
}

function score(ref: AssetRef, m: AssetMeta): number {
  let s = 0
  if (m.filename === ref.filename) s += 4
  if (m.size === ref.size) s += 3
  if (s === 0 && mimeFamily(m.mime) === mimeFamily(ref.mime)) s += 1
  return s
}

function mimeFamily(mime: string): string {
  return mime.split('/')[0] ?? ''
}

/** Which refs in a workflow are missing locally, keyed by asset id. */
export function missingRefs(refs: AssetRef[], locals: AssetMeta[]): Set<string> {
  const localIds = new Set(locals.map((m) => m.id))
  return new Set(refs.filter((r) => !localIds.has(r.id)).map((r) => r.id))
}
