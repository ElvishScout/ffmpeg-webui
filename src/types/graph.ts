import type { PortType } from './filter'

export const SCHEMA_VERSION = 1 as const

/** Reference to an asset. Imported workflows may reference assets not present locally. */
export interface AssetRef {
  id: string
  filename: string
  size: number
  mime: string
}

export type NodeKind = 'asset' | 'source' | 'filter' | 'raw' | 'stage' | 'output'

export type EncodePreset = 'lossless' | 'high' | 'fast' | 'copy'

export interface WorkflowNode {
  id: string
  kind: NodeKind
  position: { x: number; y: number }
  /** kind = asset */
  assetRef?: AssetRef
  /** kind = asset: input-side options (applied before -i) */
  inputSS?: string
  inputT?: string
  streamLoop?: number
  /** kind = asset: which stream of the container to use (default 0) */
  vStream?: number
  aStream?: number
  /** kind = source: lavfi source filter, e.g. "color=c=black:s=1280x720:d=5" */
  sourceFilter?: string
  sourceOutputs?: PortType[]
  /** kind = filter */
  filterName?: string
  params?: Record<string, unknown>
  /** dynamic input pad count (filters with inputsFrom) */
  inputCount?: number
  /** dynamic output pad count (filters with outputsFrom) */
  outputCount?: number
  /** kind = raw */
  rawFilter?: string
  rawInputs?: PortType[]
  rawOutputs?: PortType[]
  /** kind = stage | output */
  preset?: EncodePreset
  filename?: string
  /** number of audio input pads (default 1, 0 = video only) */
  audioPads?: number
  /** extra raw ffmpeg output args, e.g. "-movflags +faststart" */
  advancedArgs?: string
}

export interface WorkflowEdge {
  id: string
  source: string
  /** handle id, e.g. "out-0" */
  sourceHandle: string
  target: string
  /** handle id, e.g. "in-0" */
  targetHandle: string
}

export interface WorkflowGraph {
  schemaVersion: number
  name: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}
