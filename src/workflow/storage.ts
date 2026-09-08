import { db, type StoredWorkflow } from "../data/db";
import type { WorkflowGraph } from "../types/graph";
import { newId } from "../data/assets";

export async function listWorkflows(): Promise<StoredWorkflow[]> {
  const d = await db();
  const all = (await d.getAll("workflows")) as StoredWorkflow[];
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveWorkflow(graph: WorkflowGraph, id?: string): Promise<StoredWorkflow> {
  const d = await db();
  const record: StoredWorkflow = {
    id: id ?? newId(),
    name: graph.name,
    updatedAt: Date.now(),
    graph,
  };
  await d.put("workflows", record);
  return record;
}

export async function deleteWorkflow(id: string): Promise<void> {
  const d = await db();
  await d.delete("workflows", id);
}
