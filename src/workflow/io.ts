import type { WorkflowGraph } from '../types/graph'
import { SCHEMA_VERSION } from '../types/graph'
import { migrateGraph } from './migrate'

/** Export envelope written to disk. Always latest schema. */
export interface WorkflowFile {
  app: 'ffmpeg-webui'
  exportedAt: string
  graph: WorkflowGraph
}

export function exportWorkflow(graph: WorkflowGraph): string {
  const file: WorkflowFile = {
    app: 'ffmpeg-webui',
    exportedAt: new Date().toISOString(),
    graph: { ...graph, schemaVersion: SCHEMA_VERSION },
  }
  return JSON.stringify(file, null, 2)
}

/** Parse + migrate an imported file. Throws on invalid content. */
export function importWorkflow(text: string): WorkflowGraph {
  const parsed: unknown = JSON.parse(text)
  const raw =
    typeof parsed === 'object' && parsed !== null && 'graph' in parsed
      ? (parsed as { graph: unknown }).graph
      : parsed // tolerate a bare graph
  return migrateGraph(raw)
}
