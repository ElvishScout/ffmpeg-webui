import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useGraphStore } from '../src/stores/graph'

beforeEach(() => setActivePinia(createPinia()))

describe('nextSinkFilename', () => {
  it('defaults to output.mp4 / mid.mp4', () => {
    const store = useGraphStore()
    expect(store.nextSinkFilename('output')).toBe('output.mp4')
    expect(store.nextSinkFilename('stage')).toBe('mid.mp4')
  })

  it('suffixes to avoid collisions with existing sinks', () => {
    const store = useGraphStore()
    store.addSinkNode('output')
    store.addSinkNode('output')
    store.addSinkNode('stage')
    expect(store.nodes.map((n) => n.filename)).toEqual(['output.mp4', 'output_2.mp4', 'mid.mp4'])
    expect(store.nextSinkFilename('output')).toBe('output_3.mp4')
  })

  it('uses the format extension', () => {
    const store = useGraphStore()
    expect(store.nextSinkFilename('output', 'webm')).toBe('output.webm')
    store.addSinkNode('output', 'gif')
    expect(store.nodes[0].filename).toBe('output.gif')
    expect(store.nextSinkFilename('output', 'gif')).toBe('output_2.gif')
  })

  it('does not collide across kinds (output.mp4 and mid.mp4 coexist)', () => {
    const store = useGraphStore()
    store.addSinkNode('output')
    expect(store.nextSinkFilename('stage')).toBe('mid.mp4')
  })
})
