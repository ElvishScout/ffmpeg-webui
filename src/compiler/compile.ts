import type { WorkflowGraph, WorkflowNode, WorkflowEdge, AssetRef } from '../types/graph'
import type { Job, JobSegment, JobInput, JobOutput } from '../types/job'
import { filterByName } from '../filters/registry'
import { FORMATS, formatOf, codecArgs } from './formats'
import {
  validateGraph,
  topoSort,
  inputPads,
  outputPads,
  nodeDisplayName,
  type ValidationError,
} from './validate'

export interface CompileOptions {
  /** probed durations in seconds, keyed by asset id (for progress estimation) */
  assetDurations?: Record<string, number>
  missingAssetIds?: Set<string>
}

export interface CompileResult {
  job?: Job
  errors: ValidationError[]
}

/** Escape a value for use inside a filtergraph argument. */
function escapeFilterValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
}

/** Serialize one filter node to its filtergraph fragment. */
export function serializeFilter(node: WorkflowNode): string {
  if (node.kind === 'raw') return node.rawFilter?.trim() ?? ''
  if (node.kind === 'source') return node.sourceFilter?.trim() ?? ''
  const spec = node.filterName ? filterByName.get(node.filterName) : undefined
  if (!spec) return ''
  const params = node.params ?? {}
  if (spec.positionalCount) {
    const key = spec.outputsFrom ?? spec.inputsFrom!
    return `${spec.name}=${Number(params[key] ?? spec.params.find((p) => p.key === key)?.default ?? 2)}`
  }
  const parts: string[] = []
  for (const p of spec.params) {
    let value = params[p.key]
    if (value === undefined || value === null || value === '') continue
    if (p.type === 'boolean') value = value ? 1 : 0
    if (typeof value === 'number') value = String(value)
    parts.push(`${p.key}=${escapeFilterValue(String(value))}`)
  }
  return parts.length ? `${spec.name}=${parts.join(':')}` : spec.name
}

function ensureExt(filename: string, ext: string): string {
  return /\.[a-z0-9]{2,5}$/i.test(filename) ? filename : `${filename}.${ext}`
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|\s]+/g, '_')
}

function splitArgs(s: string): string[] {
  const m = s.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? []
  return m.map((t) => t.replace(/^["']|["']$/g, ''))
}

const isImage = (mime: string) => mime.startsWith('image/')

/**
 * Animated image formats carry their own frame timing, so they must NOT get
 * `-loop 1 -framerate N` (those are image2-demuxer options; the gif/apng
 * demuxers reject `loop` outright with "Option loop not found").
 */
const isAnimatedImage = (asset: AssetRef) =>
  asset.mime === 'image/gif' ||
  asset.mime === 'image/apng' ||
  /\.(gif|apng)$/i.test(asset.filename)

export function compileGraph(graph: WorkflowGraph, opts: CompileOptions = {}): CompileResult {
  const validation = validateGraph(graph, { missingAssetIds: opts.missingAssetIds })
  if (!validation.ok) return { errors: validation.errors }

  const order = topoSort(graph)! // validated acyclic above
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))

  // --- segment assignment ---
  // outSeg: the segment in which a node's output is consumable.
  // stage is a sink in segment s and a source in segment s+1.
  const outSeg = new Map<string, number>()
  const sinkSeg = new Map<string, number>() // for stage & output nodes
  const incoming = new Map<string, typeof graph.edges>()
  for (const e of graph.edges) incoming.set(e.target, [...(incoming.get(e.target) ?? []), e])

  for (const node of order) {
    const upSegs = (incoming.get(node.id) ?? []).map((e) => outSeg.get(e.source) ?? 0)
    const maxUp = upSegs.length ? Math.max(...upSegs) : 0
    switch (node.kind) {
      case 'asset':
        outSeg.set(node.id, 0)
        break
      case 'filter':
      case 'raw':
      case 'source':
        outSeg.set(node.id, maxUp)
        break
      case 'stage':
        sinkSeg.set(node.id, maxUp)
        outSeg.set(node.id, maxUp + 1)
        break
      case 'output':
        sinkSeg.set(node.id, maxUp)
        break
    }
  }

  const segCount = Math.max(0, ...[...sinkSeg.values()]) + 1
  const segments: JobSegment[] = []
  const nodeLabels: Record<string, string> = {}
  for (const n of graph.nodes) nodeLabels[n.id] = nodeDisplayName(n)

  for (let seg = 0; seg < segCount; seg++) {
    // nodes processed in this segment
    const segNodes = order.filter(
      (n) => (n.kind === 'filter' || n.kind === 'raw' || n.kind === 'source') && outSeg.get(n.id) === seg,
    )
    const sinks = order.filter(
      (n) => (n.kind === 'output' || n.kind === 'stage') && sinkSeg.get(n.id) === seg,
    )
    if (sinks.length === 0) continue

    // --- inputs of this segment, in first-use order ---
    const inputIndex = new Map<string, number>() // key: asset:<id> | mid:<nodeId>
    const inputs: JobInput[] = []
    const inputKeyForEdgeSource = (srcId: string): string | null => {
      const src = byId.get(srcId)
      if (!src) return null
      if (src.kind === 'asset' && src.assetRef) return `asset:${src.assetRef.id}`
      if (src.kind === 'stage') return `mid:${src.id}`
      return null
    }
    const ensureInput = (srcId: string): number | null => {
      const key = inputKeyForEdgeSource(srcId)
      if (!key) return null
      const existing = inputIndex.get(key)
      if (existing !== undefined) return existing
      const src = byId.get(srcId)!
      const idx = inputs.length
      if (src.kind === 'asset' && src.assetRef) {
        const ext = src.assetRef.filename.match(/\.[a-z0-9]{2,5}$/i)?.[0] ?? ''
        inputs.push({
          file: `in${idx}${ext}`,
          source: { kind: 'asset', asset: src.assetRef },
          inputSS: src.inputSS?.trim() || undefined,
          inputT: src.inputT?.trim() || undefined,
          streamLoop: src.streamLoop,
        })
      } else {
        const node = src // stage
        inputs.push({
          file: ensureExt(sanitizeFilename(node.filename ?? `mid_${node.id}`), FORMATS[formatOf(node)].ext),
          source: { kind: 'stage', nodeId: node.id },
        })
      }
      inputIndex.set(key, idx)
      return idx
    }

    // pre-scan all edges touching this segment so indices are stable
    const segNodeIds = new Set(segNodes.map((n) => n.id))
    const sinkIds = new Set(sinks.map((n) => n.id))
    for (const e of graph.edges) {
      if (segNodeIds.has(e.target) || sinkIds.has(e.target)) ensureInput(e.source)
    }

    // --- filtergraph ---
    // label per (nodeId, outPad) within this segment
    const label = new Map<string, string>()
    let labelCounter = 0
    const freshLabel = () => `n${labelCounter++}`
    const labelFor = (nodeId: string, pad: number) => {
      const key = `${nodeId}:${pad}`
      let l = label.get(key)
      if (!l) {
        l = freshLabel()
        label.set(key, l)
      }
      return l
    }

    const padLetter = (nodeId: string, handle: string): 'v' | 'a' => {
      const node = byId.get(nodeId)!
      const padIdx = Number(handle.replace('in-', ''))
      return inputPads(node)[padIdx]?.type === 'audio' ? 'a' : 'v'
    }

    /** `v` / `a` plus a stream index when the asset node selects one: v:1 */
    const streamSpec = (srcId: string, letter: 'v' | 'a'): string => {
      const src = byId.get(srcId)
      if (src?.kind !== 'asset') return letter
      const idx = letter === 'v' ? (src.vStream ?? 0) : (src.aStream ?? 0)
      return idx > 0 ? `${letter}:${idx}` : letter
    }

    const chains: string[] = []
    for (const node of segNodes) {
      const ins = inputPads(node)
      const inLabels: string[] = []
      for (let i = 0; i < ins.length; i++) {
        const e = (incoming.get(node.id) ?? []).find((x) => x.targetHandle === `in-${i}`)!
        const src = byId.get(e.source)!
        if (src.kind === 'filter' || src.kind === 'raw' || src.kind === 'source') {
          const pad = Number(e.sourceHandle.replace('out-', ''))
          inLabels.push(`[${labelFor(src.id, pad)}]`)
        } else {
          const idx = ensureInput(e.source)!
          inLabels.push(`[${idx}:${streamSpec(e.source, padLetter(node.id, e.targetHandle))}]`)
        }
      }
      const outs = outputPads(node)
      const outLabels = outs.map((_, i) => `[${labelFor(node.id, i)}]`).join('')
      chains.push(`${inLabels.join('')}${serializeFilter(node)}${outLabels}`)
    }

    // --- outputs (one set of args per sink) ---
    const outputs: JobOutput[] = []
    const args: string[] = ['-y']
    for (const input of inputs) {
      if (input.source.kind === 'asset') {
        if (
          isImage(input.source.asset.mime) &&
          !isAnimatedImage(input.source.asset) &&
          input.streamLoop === undefined
        ) {
          args.push('-loop', '1', '-framerate', '30')
        }
        if (input.streamLoop !== undefined) args.push('-stream_loop', String(input.streamLoop))
        if (input.inputSS) args.push('-ss', input.inputSS)
        if (input.inputT) args.push('-t', input.inputT)
      }
      args.push('-i', input.file)
    }

    const mapRef = (e: WorkflowEdge, letter: 'v' | 'a'): string => {
      const src = byId.get(e.source)!
      if (src.kind === 'filter' || src.kind === 'raw' || src.kind === 'source') {
        return `[${labelFor(src.id, Number(e.sourceHandle.replace('out-', '')))}]`
      }
      return `${ensureInput(e.source)}:${streamSpec(e.source, letter)}`
    }

    // Pre-pass: build one plan per sink. gif sinks append a palette chain to
    // `chains`, so this must run before -filter_complex is emitted.
    interface SinkPlan {
      sink: (typeof sinks)[number]
      maps: string[]
      hasVideo: boolean
      hasAudio: boolean
    }
    const sinkPlans: SinkPlan[] = sinks.map((sink) => {
      const sinkEdges = incoming.get(sink.id) ?? []
      const sinkPads = inputPads(sink)
      const plan: SinkPlan = { sink, maps: [], hasVideo: false, hasAudio: false }
      for (let i = 0; i < sinkPads.length; i++) {
        const e = sinkEdges.find((x) => x.targetHandle === `in-${i}`)
        if (!e) continue
        const letter = sinkPads[i].type === 'audio' ? 'a' : 'v'
        const ref = mapRef(e, letter)
        if (formatOf(sink) === 'gif' && letter === 'v') {
          // two-pass palette in one command: fps/scale -> split -> palettegen + paletteuse
          const srcRef = ref.startsWith('[') ? ref : `[${ref}]`
          const a = freshLabel()
          const b = freshLabel()
          const p = freshLabel()
          const g = freshLabel()
          const fps = sink.gifFps ?? 15
          const w = sink.gifWidth ?? 480
          chains.push(
            `${srcRef}fps=${fps},scale=${w}:-1:flags=lanczos,split[${a}][${b}];` +
              `[${a}]palettegen[${p}];[${b}][${p}]paletteuse[${g}]`,
          )
          plan.maps.push(`[${g}]`)
        } else {
          plan.maps.push(ref)
        }
        if (letter === 'v') plan.hasVideo = true
        else plan.hasAudio = true
      }
      return plan
    })

    if (chains.length) args.push('-filter_complex', chains.join(';'))

    for (const plan of sinkPlans) {
      const { sink } = plan
      const format = formatOf(sink)
      const codec = codecArgs(format, sink.preset)
      for (const m of plan.maps) args.push('-map', m)
      if (plan.hasVideo) args.push(...codec.video)
      if (plan.hasAudio) args.push(...codec.audio)
      if (sink.advancedArgs?.trim()) args.push(...splitArgs(sink.advancedArgs))
      const file = ensureExt(sanitizeFilename(sink.filename!.trim()), FORMATS[format].ext)
      args.push(file)
      outputs.push({
        file,
        nodeId: sink.id,
        kind: sink.kind === 'stage' ? 'stage' : 'output',
      })
    }

    let expectedDuration = 0
    for (const input of inputs) {
      if (input.source.kind === 'asset') {
        expectedDuration = Math.max(
          expectedDuration,
          opts.assetDurations?.[input.source.asset.id] ?? 0,
        )
      }
    }

    segments.push({ args, inputs, outputs, expectedDuration: expectedDuration || undefined })
  }

  return { errors: [], job: { segments, nodeLabels } }
}

/** Render a Job as copy-pastable shell commands. */
export function jobToCommands(job: Job): string[] {
  return job.segments.map((seg) => `ffmpeg ${quoteArgs(seg.args)}`)
}

function quoteArgs(args: string[]): string {
  return args.map((a) => (/[\s'"[\],:;]/.test(a) && !a.startsWith('-') ? `'${a.replace(/'/g, "'\\''")}'` : a)).join(' ')
}
