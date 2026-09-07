import { openDB, type IDBPDatabase } from 'idb'
import type { WorkflowGraph } from '../types/graph'

export interface AssetMeta {
  id: string
  filename: string
  size: number
  mime: string
  kind: 'video' | 'audio' | 'image' | 'other'
  createdAt: number
  /** probed */
  duration?: number
  width?: number
  height?: number
}

export interface StoredWorkflow {
  id: string
  name: string
  updatedAt: number
  graph: WorkflowGraph
}

const DB_NAME = 'ffmpeg-webui'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase> | null = null

export function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(d) {
        d.createObjectStore('assets', { keyPath: 'id' })
        d.createObjectStore('workflows', { keyPath: 'id' })
      },
    })
  }
  return dbPromise
}
