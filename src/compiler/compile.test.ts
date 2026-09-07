import { describe, it, expect } from 'vitest'
import { compileGraph, jobToCommands, serializeFilter } from './compile'
import { validateGraph, portsCompatible } from './validate'
import type { WorkflowGraph, WorkflowNode, WorkflowEdge, AssetRef } from '../types/graph'

const asset = (id: string, filename = `${id}.mp4`): AssetRef => ({
  id, filename, size: 1000, mime: 'video/mp4',
})

let nid = 0
function node(partial: Partial<WorkflowNode> & { kind: WorkflowNode['kind'] }): WorkflowNode {
  return { id: `n${++nid}`, position: { x: 0, y: 0 }, ...partial } as WorkflowNode
}
function edge(source: string, sh: string, target: string, th: string): WorkflowEdge {
  return { id: `e-${source}-${sh}-${target}-${th}`, source, sourceHandle: sh, target, targetHandle: th }
}
function graph(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowGraph {
  return { schemaVersion: 1, name: 't', nodes, edges }
}

describe('portsCompatible', () => {
  it('av feeds anything, video only video, audio only audio', () => {
    expect(portsCompatible('av', 'video')).toBe(true)
    expect(portsCompatible('av', 'audio')).toBe(true)
    expect(portsCompatible('video', 'video')).toBe(true)
    expect(portsCompatible('video', 'audio')).toBe(false)
    expect(portsCompatible('audio', 'video')).toBe(false)
  })
})

describe('serializeFilter', () => {
  it('serializes named params and skips empty', () => {
    const n = node({ kind: 'filter', filterName: 'scale', params: { w: '1280', h: '-1', flags: 'lanczos' } })
    expect(serializeFilter(n)).toBe('scale=w=1280:h=-1:flags=lanczos')
  })
  it('serializes bare filter when no params set', () => {
    const n = node({ kind: 'filter', filterName: 'hflip', params: {} })
    expect(serializeFilter(n)).toBe('hflip')
  })
  it('escapes special chars', () => {
    const n = node({ kind: 'filter', filterName: 'drawtext', params: { text: "a:b,c" } })
    expect(serializeFilter(n)).toBe('drawtext=text=a\\:b\\,c')
  })
  it('serializes split positionally', () => {
    const n = node({ kind: 'filter', filterName: 'split', params: { n: 3 }, outputCount: 3 })
    expect(serializeFilter(n)).toBe('split=3')
  })
})

describe('validateGraph', () => {
  it('rejects graph without output', () => {
    const g = graph([node({ kind: 'asset', assetRef: asset('a') })], [])
    const r = validateGraph(g)
    expect(r.ok).toBe(false)
    expect(r.errors.some((e) => e.code === 'noOutput')).toBe(true)
  })
  it('rejects cycles', () => {
    const a = node({ kind: 'filter', filterName: 'hflip' })
    const b = node({ kind: 'filter', filterName: 'vflip' })
    const o = node({ kind: 'output', filename: 'o' })
    const g = graph([a, b, o], [
      edge(a.id, 'out-0', b.id, 'in-0'),
      edge(b.id, 'out-0', a.id, 'in-0'),
      edge(b.id, 'out-0', o.id, 'in-0'),
    ])
    const r = validateGraph(g)
    expect(r.errors.some((e) => e.code === 'cycle')).toBe(true)
  })
  it('rejects unconnected filter inputs', () => {
    const f = node({ kind: 'filter', filterName: 'scale' })
    const o = node({ kind: 'output', filename: 'o' })
    const g = graph([f, o], [edge(f.id, 'out-0', o.id, 'in-0')])
    const r = validateGraph(g)
    expect(r.errors.some((e) => e.code === 'inputUnconnected')).toBe(true)
  })
  it('rejects missing asset references', () => {
    const a = node({ kind: 'asset', assetRef: asset('gone') })
    const o = node({ kind: 'output', filename: 'o' })
    const g = graph([a, o], [edge(a.id, 'out-0', o.id, 'in-0')])
    const r = validateGraph(g, { missingAssetIds: new Set(['gone']) })
    expect(r.errors.some((e) => e.code === 'assetMissing')).toBe(true)
  })
  it('accepts a minimal asset -> output graph', () => {
    const a = node({ kind: 'asset', assetRef: asset('a') })
    const o = node({ kind: 'output', filename: 'o' })
    const g = graph([a, o], [edge(a.id, 'out-0', o.id, 'in-0')])
    expect(validateGraph(g).ok).toBe(true)
  })
})

describe('compileGraph', () => {
  it('compiles direct asset -> output to a single map command', () => {
    const a = node({ kind: 'asset', assetRef: asset('a') })
    const o = node({ kind: 'output', filename: 'out', preset: 'high' })
    const g = graph([a, o], [edge(a.id, 'out-0', o.id, 'in-0')])
    const { job, errors } = compileGraph(g)
    expect(errors).toEqual([])
    expect(job!.segments).toHaveLength(1)
    const args = job!.segments[0].args
    expect(args).toContain('-i')
    expect(args).not.toContain('-filter_complex')
    expect(args).toContain('0:v')
    expect(args).toContain('libx264')
    expect(args[args.length - 1]).toBe('out.mp4')
  })

  it('compiles a filter chain to filter_complex', () => {
    const a = node({ kind: 'asset', assetRef: asset('a') })
    const s = node({ kind: 'filter', filterName: 'scale', params: { w: '640', h: '-1' } })
    const h = node({ kind: 'filter', filterName: 'hflip', params: {} })
    const o = node({ kind: 'output', filename: 'out', preset: 'fast' })
    const g = graph([a, s, h, o], [
      edge(a.id, 'out-0', s.id, 'in-0'),
      edge(s.id, 'out-0', h.id, 'in-0'),
      edge(h.id, 'out-0', o.id, 'in-0'),
    ])
    const { job } = compileGraph(g)
    const seg = job!.segments[0]
    const fc = seg.args[seg.args.indexOf('-filter_complex') + 1]
    expect(fc).toBe('[0:v]scale=w=640:h=-1[n0];[n0]hflip[n1]')
    expect(seg.args.join(' ')).toContain('-map [n1]')
  })

  it('splits segments at stage nodes and wires the file through', () => {
    const a = node({ kind: 'asset', assetRef: asset('a') })
    const s1 = node({ kind: 'filter', filterName: 'hflip' })
    const mid = node({ kind: 'stage', filename: 'mid', preset: 'lossless' })
    const s2 = node({ kind: 'filter', filterName: 'vflip' })
    const o = node({ kind: 'output', filename: 'out', preset: 'high' })
    const g = graph([a, s1, mid, s2, o], [
      edge(a.id, 'out-0', s1.id, 'in-0'),
      edge(s1.id, 'out-0', mid.id, 'in-0'),
      edge(mid.id, 'out-0', s2.id, 'in-0'),
      edge(s2.id, 'out-0', o.id, 'in-0'),
    ])
    const { job, errors } = compileGraph(g)
    expect(errors).toEqual([])
    expect(job!.segments).toHaveLength(2)
    const [seg0, seg1] = job!.segments
    expect(seg0.outputs[0]).toMatchObject({ file: 'mid.mkv', kind: 'stage', nodeId: mid.id })
    expect(seg1.inputs[0]).toMatchObject({ file: 'mid.mkv', source: { kind: 'stage', nodeId: mid.id } })
    expect(seg1.args.join(' ')).toContain('-i mid.mkv')
  })

  it('maps both video and audio pads on outputs', () => {
    const a = node({ kind: 'asset', assetRef: asset('a') })
    const vol = node({ kind: 'filter', filterName: 'volume', params: { volume: '0.5' } })
    const o = node({ kind: 'output', filename: 'out', preset: 'high' })
    const g = graph([a, vol, o], [
      edge(a.id, 'out-0', o.id, 'in-0'),
      edge(a.id, 'out-0', vol.id, 'in-0'),
      edge(vol.id, 'out-0', o.id, 'in-1'),
    ])
    const { job } = compileGraph(g)
    const args = job!.segments[0].args.join(' ')
    expect(args).toContain('-map 0:v')
    expect(args).toContain('volume=volume=0.5')
    expect(args).toContain('aac')
  })

  it('expands concat input pads from the n param', () => {
    const a = node({ kind: 'asset', assetRef: asset('a', 'a.mp4') })
    const b = node({ kind: 'asset', assetRef: asset('b', 'b.mp4') })
    const c = node({ kind: 'filter', filterName: 'concat', params: { n: 2, v: 1, a: 0 }, inputCount: 2 })
    const o = node({ kind: 'output', filename: 'out' })
    const g = graph([a, b, c, o], [
      edge(a.id, 'out-0', c.id, 'in-0'),
      edge(b.id, 'out-0', c.id, 'in-1'),
      edge(c.id, 'out-0', o.id, 'in-0'),
    ])
    const { job, errors } = compileGraph(g)
    expect(errors).toEqual([])
    const seg = job!.segments[0]
    expect(seg.inputs).toHaveLength(2)
    const fc = seg.args[seg.args.indexOf('-filter_complex') + 1]
    expect(fc).toMatch(/^\[0:v\]\[1:v\]concat=n=2:v=1:a=0\[n\d\]$/)
  })

  it('adds -loop 1 for image inputs', () => {
    const a = node({ kind: 'asset', assetRef: { id: 'img', filename: 'p.png', size: 1, mime: 'image/png' } })
    const o = node({ kind: 'output', filename: 'out' })
    const g = graph([a, o], [edge(a.id, 'out-0', o.id, 'in-0')])
    const { job } = compileGraph(g)
    expect(job!.segments[0].args.join(' ')).toContain('-loop 1 -framerate 30 -i in0.png')
  })

  it('emits asset input options before -i', () => {
    const a = node({
      kind: 'asset', assetRef: asset('a'),
      inputSS: '10', inputT: '5', streamLoop: 2,
    })
    const o = node({ kind: 'output', filename: 'out' })
    const g = graph([a, o], [edge(a.id, 'out-0', o.id, 'in-0')])
    const { job } = compileGraph(g)
    const args = job!.segments[0].args.join(' ')
    expect(args).toContain('-stream_loop 2 -ss 10 -t 5 -i in0.mp4')
  })

  it('selects streams by index on the asset node', () => {
    const a = node({ kind: 'asset', assetRef: asset('a'), vStream: 1, aStream: 2 })
    const o = node({ kind: 'output', filename: 'out' })
    const g = graph([a, o], [
      edge(a.id, 'out-0', o.id, 'in-0'),
      edge(a.id, 'out-0', o.id, 'in-1'),
    ])
    const { job } = compileGraph(g)
    const args = job!.segments[0].args.join(' ')
    expect(args).toContain('-map 0:v:1')
    expect(args).toContain('-map 0:a:2')
  })

  it('supports the copy preset', () => {
    const a = node({ kind: 'asset', assetRef: asset('a') })
    const o = node({ kind: 'output', filename: 'out', preset: 'copy' })
    const g = graph([a, o], [edge(a.id, 'out-0', o.id, 'in-0')])
    const { job } = compileGraph(g)
    const args = job!.segments[0].args
    expect(args.join(' ')).toContain('-c:v copy')
    expect(args[args.length - 1]).toBe('out.mkv')
  })

  it('maps multiple audio pads on outputs', () => {
    const a = node({ kind: 'asset', assetRef: asset('a') })
    const b = node({ kind: 'asset', assetRef: asset('b', 'b.mp3') })
    ;(b.assetRef as AssetRef).mime = 'audio/mpeg'
    const o = node({ kind: 'output', filename: 'out', audioPads: 2 })
    const g = graph([a, b, o], [
      edge(a.id, 'out-0', o.id, 'in-0'),
      edge(a.id, 'out-0', o.id, 'in-1'),
      edge(b.id, 'out-0', o.id, 'in-2'),
    ])
    const { job, errors } = compileGraph(g)
    expect(errors).toEqual([])
    const args = job!.segments[0].args.join(' ')
    expect(args).toContain('-map 0:v')
    expect(args).toContain('-map 0:a')
    expect(args).toContain('-map 1:a')
  })

  it('compiles lavfi source nodes as filtergraph sources', () => {
    const s = node({ kind: 'source', sourceFilter: 'color=c=red:s=320x240:d=1', sourceOutputs: ['video'] })
    const f = node({ kind: 'filter', filterName: 'hflip' })
    const o = node({ kind: 'output', filename: 'out' })
    const g = graph([s, f, o], [
      edge(s.id, 'out-0', f.id, 'in-0'),
      edge(f.id, 'out-0', o.id, 'in-0'),
    ])
    const { job, errors } = compileGraph(g)
    expect(errors).toEqual([])
    const seg = job!.segments[0]
    expect(seg.inputs).toHaveLength(0)
    const fc = seg.args[seg.args.indexOf('-filter_complex') + 1]
    expect(fc).toBe('color=c=red:s=320x240:d=1[n0];[n0]hflip[n1]')
  })

  it('rejects empty source expressions', () => {
    const s = node({ kind: 'source', sourceFilter: '', sourceOutputs: ['video'] })
    const o = node({ kind: 'output', filename: 'out' })
    const g = graph([s, o], [edge(s.id, 'out-0', o.id, 'in-0')])
    const { errors } = compileGraph(g)
    expect(errors.some((e) => e.code === 'sourceEmpty')).toBe(true)
  })

  it('renders commands with quoted filtergraph', () => {
    const a = node({ kind: 'asset', assetRef: asset('a') })
    const f = node({ kind: 'filter', filterName: 'hflip' })
    const o = node({ kind: 'output', filename: 'out' })
    const g = graph([a, f, o], [
      edge(a.id, 'out-0', f.id, 'in-0'),
      edge(f.id, 'out-0', o.id, 'in-0'),
    ])
    const { job } = compileGraph(g)
    const [cmd] = jobToCommands(job!)
    expect(cmd).toMatch(/^ffmpeg -y -i in0\.mp4 -filter_complex '.+' .+ out\.mp4$/)
  })
})
