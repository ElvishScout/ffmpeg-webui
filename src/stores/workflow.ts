import { defineStore } from "pinia";
import { ref } from "vue";
import { listWorkflows, saveWorkflow, deleteWorkflow } from "../workflow/storage";
import { exportWorkflow, importWorkflow } from "../workflow/io";
import type { StoredWorkflow } from "../data/db";
import { useGraphStore } from "./graph";

export const useWorkflowStore = defineStore("workflow", () => {
  const saved = ref<StoredWorkflow[]>([]);
  const currentId = ref<string | null>(null);

  const graphStore = useGraphStore();

  async function refresh() {
    saved.value = await listWorkflows();
  }

  async function save(): Promise<StoredWorkflow> {
    const g = { ...graphStore.graph, name: graphStore.name || "workflow" };
    const rec = await saveWorkflow(g, currentId.value ?? undefined);
    currentId.value = rec.id;
    await refresh();
    return rec;
  }

  async function saveAs(name: string): Promise<StoredWorkflow> {
    const g = { ...graphStore.graph, name };
    const rec = await saveWorkflow(g); // no id -> new record
    currentId.value = rec.id;
    graphStore.name = name;
    await refresh();
    return rec;
  }

  async function open(id: string) {
    const rec = saved.value.find((w) => w.id === id);
    if (!rec) return;
    graphStore.load(rec.graph, rec.name);
    currentId.value = rec.id;
  }

  async function remove(id: string) {
    await deleteWorkflow(id);
    if (currentId.value === id) currentId.value = null;
    await refresh();
  }

  function newWorkflow() {
    graphStore.clear();
    currentId.value = null;
  }

  function exportCurrent(): string {
    return exportWorkflow({
      ...graphStore.graph,
      name: graphStore.name || "workflow",
    });
  }

  function importFromText(text: string) {
    const g = importWorkflow(text);
    graphStore.load(g);
    currentId.value = null; // imported graphs are unsaved until explicitly saved
  }

  return {
    saved,
    currentId,
    refresh,
    save,
    saveAs,
    open,
    remove,
    newWorkflow,
    exportCurrent,
    importFromText,
  };
});
