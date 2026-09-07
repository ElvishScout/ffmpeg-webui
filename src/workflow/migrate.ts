import type { WorkflowGraph } from '../types/graph'
import { SCHEMA_VERSION } from '../types/graph'

type Migration = (g: Record<string, unknown>) => Record<string, unknown>

/**
 * Ordered, chained migrations: index i upgrades version (i+1) -> (i+2).
 * First version ships as 1 with no migrations; append here on breaking changes.
 */
const MIGRATIONS: Migration[] = []

export class MigrationError extends Error {}

export function migrateGraph(raw: unknown): WorkflowGraph {
  if (typeof raw !== 'object' || raw === null) throw new MigrationError('not an object')
  let g = raw as Record<string, unknown>
  let version = typeof g.schemaVersion === 'number' ? g.schemaVersion : 0
  if (version > SCHEMA_VERSION) {
    throw new MigrationError(`schemaVersion ${version} is newer than supported ${SCHEMA_VERSION}`)
  }
  while (version < SCHEMA_VERSION) {
    const migrate = MIGRATIONS[version - 1]
    if (!migrate) throw new MigrationError(`no migration from version ${version}`)
    g = migrate(g)
    version = typeof g.schemaVersion === 'number' ? g.schemaVersion : version + 1
  }
  assertShape(g)
  return g as unknown as WorkflowGraph
}

function assertShape(g: Record<string, unknown>) {
  if (!Array.isArray(g.nodes) || !Array.isArray(g.edges)) {
    throw new MigrationError('graph missing nodes/edges arrays')
  }
  if (typeof g.name !== 'string') g.name = 'workflow'
}
