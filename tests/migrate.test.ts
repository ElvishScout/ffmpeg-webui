import { describe, it, expect } from "vitest";
import { migrateGraph, MigrationError } from "../src/workflow/migrate";
import { exportWorkflow, importWorkflow } from "../src/workflow/io";
import type { WorkflowGraph } from "../src/types/graph";

const g = (over: Partial<WorkflowGraph> = {}): WorkflowGraph => ({
  schemaVersion: 1,
  name: "demo",
  nodes: [],
  edges: [],
  ...over,
});

describe("migrateGraph", () => {
  it("passes through current version", () => {
    expect(migrateGraph(g()).name).toBe("demo");
  });
  it("rejects newer versions", () => {
    expect(() => migrateGraph(g({ schemaVersion: 99 }))).toThrow(MigrationError);
  });
  it("rejects malformed graphs", () => {
    expect(() => migrateGraph({ schemaVersion: 1 })).toThrow(MigrationError);
    expect(() => migrateGraph("nope")).toThrow(MigrationError);
  });
});

describe("workflow io", () => {
  it("round-trips export -> import", () => {
    const graph = g({
      nodes: [{ id: "n1", kind: "output", position: { x: 0, y: 0 }, filename: "o" }],
    });
    const text = exportWorkflow(graph);
    const back = importWorkflow(text);
    expect(back.schemaVersion).toBe(1);
    expect(back.nodes).toHaveLength(1);
    expect(back.name).toBe("demo");
  });
  it("accepts a bare graph object", () => {
    const back = importWorkflow(JSON.stringify(g()));
    expect(back.schemaVersion).toBe(1);
  });
  it("throws on garbage", () => {
    expect(() => importWorkflow("not json")).toThrow();
  });
});
