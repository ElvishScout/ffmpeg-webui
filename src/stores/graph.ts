import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { WorkflowGraph, WorkflowNode, WorkflowEdge, AssetRef } from '../types/graph'
import type { PortType } from '../types/filter'
import { SCHEMA_VERSION } from '../types/graph'
import { validateGraph, inputPads, outputPads, portsCompatible } from '../compiler/validate'
import { compileGraph, type CompileResult } from '../compiler/compile'
import { useAssetsStore } from './assets'
import { missingRefs } from '../data/match'

let nodeSeq = 0

export const useGraphStore = defineStore('graph', () => {
  const name = ref('')
  const nodes = ref<WorkflowNode[]>([])
  const edges = ref<WorkflowEdge[]>([])
  const selectedId = ref<string | null>(null)
  /** bumped on structural replacement (load/clear/add) so the canvas rebuilds */
  const revision = ref(0)

  const assetsStore = useAssetsStore()

  const missingAssetIds = computed<Set<string>>(() => {
    const refs = nodes.value
      .filter((n) => n.kind === 'asset' && n.assetRef)
      .map((n) => n.assetRef!)
    return missingRefs(refs, assetsStore.assets)
  })

  const graph = computed<WorkflowGraph>(() => ({
    schemaVersion: SCHEMA_VERSION,
    name: name.value,
    nodes: nodes.value,
    edges: edges.value,
  }))

  const validation = computed(() =>
    validateGraph(graph.value, { missingAssetIds: missingAssetIds.value }),
  )

  function compile(): CompileResult {
    return compileGraph(graph.value, {
      assetDurations: assetsStore.durations(),
      missingAssetIds: missingAssetIds.value,
    })
  }

  function load(g: WorkflowGraph, workflowName?: string) {
    nodes.value = g.nodes.map((n) => ({ ...n, position: { ...n.position } }))
    edges.value = g.edges.map((e) => ({ ...e }))
    name.value = workflowName ?? g.name
    selectedId.value = null
    revision.value++
  }

  function clear() {
    nodes.value = []
    edges.value = []
    name.value = ''
    selectedId.value = null
    revision.value++
  }

  function addNode(partial: Omit<WorkflowNode, 'id' | 'position'> & { position?: { x: number; y: number } }): WorkflowNode {
    const n: WorkflowNode = {
      ...partial,
      id: `n${Date.now().toString(36)}_${nodeSeq++}`,
      position: partial.position ?? { x: 100 + Math.random() * 200, y: 100 + Math.random() * 200 },
    }
    nodes.value.push(n)
    revision.value++
    return n
  }

  function addAssetNode(ref: AssetRef, position?: { x: number; y: number }) {
    return addNode({ kind: 'asset', assetRef: ref, position })
  }

  function updateNode(id: string, patch: Partial<WorkflowNode>) {
    const idx = nodes.value.findIndex((n) => n.id === id)
    if (idx >= 0) nodes.value[idx] = { ...nodes.value[idx], ...patch }
  }

  function updateParam(id: string, key: string, value: unknown) {
    const n = nodes.value.find((x) => x.id === id)
    if (n) n.params = { ...(n.params ?? {}), [key]: value }
  }

  function removeNode(id: string) {
    nodes.value = nodes.value.filter((n) => n.id !== id)
    edges.value = edges.value.filter((e) => e.source !== id && e.target !== id)
    if (selectedId.value === id) selectedId.value = null
  }

  function removeEdge(id: string) {
    edges.value = edges.value.filter((e) => e.id !== id)
  }

  function addEdge(e: WorkflowEdge) {
    // one edge per input pad
    edges.value = edges.value.filter(
      (x) => !(x.target === e.target && x.targetHandle === e.targetHandle),
    )
    edges.value.push(e)
  }

  /** Live connection check used by Vue Flow's isValidConnection. */
  function canConnect(sourceId: string, sourceHandle: string, targetId: string, targetHandle: string): boolean {
    if (sourceId === targetId) return false
    const src = nodes.value.find((n) => n.id === sourceId)
    const dst = nodes.value.find((n) => n.id === targetId)
    if (!src || !dst) return false
    const from = outputPads(src)[Number(sourceHandle.replace('out-', ''))]?.type
    const to = inputPads(dst)[Number(targetHandle.replace('in-', ''))]?.type
    if (!from || !to || !portsCompatible(from, to)) return false
    // would this introduce a cycle? walk downstream from target
    const adj = new Map<string, string[]>()
    for (const e of edges.value) adj.set(e.source, [...(adj.get(e.source) ?? []), e.target])
    adj.set(sourceId, [...(adj.get(sourceId) ?? []), targetId])
    const seen = new Set<string>()
    const stack = [targetId]
    while (stack.length) {
      const cur = stack.pop()!
      if (cur === sourceId) return false
      if (seen.has(cur)) continue
      seen.add(cur)
      stack.push(...(adj.get(cur) ?? []))
    }
    return true
  }

  /** Remap a ghost asset reference to an existing local asset. */
  function remapAsset(oldId: string, newRef: AssetRef) {
    for (const n of nodes.value) {
      if (n.kind === 'asset' && n.assetRef?.id === oldId) {
        n.assetRef = newRef
      }
    }
  }

  /** Pad type lookup for handle coloring in node components. */
  function padTypes(node: WorkflowNode): { inputs: PortType[]; outputs: PortType[] } {
    return {
      inputs: inputPads(node).map((p) => p.type),
      outputs: outputPads(node).map((p) => p.type),
    }
  }

  return {
    name, nodes, edges, selectedId, revision,
    graph, validation, missingAssetIds,
    compile, load, clear,
    addNode, addAssetNode, updateNode, updateParam, removeNode,
    removeEdge, addEdge, canConnect, remapAsset, padTypes,
  }
})
