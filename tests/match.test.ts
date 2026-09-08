import { describe, it, expect } from "vitest";
import { matchCandidates, missingRefs } from "../src/data/match";
import type { AssetMeta } from "../src/data/db";
import type { AssetRef } from "../src/types/graph";

const meta = (id: string, filename: string, size: number, mime = "video/mp4"): AssetMeta => ({
  id,
  filename,
  size,
  mime,
  kind: "video",
  createdAt: 0,
});

describe("matchCandidates", () => {
  it("ranks exact filename+size first", () => {
    const ref: AssetRef = {
      id: "x",
      filename: "a.mp4",
      size: 100,
      mime: "video/mp4",
    };
    const locals = [
      meta("1", "b.mp4", 100), // size only
      meta("2", "a.mp4", 100), // exact
      meta("3", "a.mp4", 200), // name only
      meta("4", "c.mkv", 5, "video/x-matroska"), // family only
    ];
    const ranked = matchCandidates(ref, locals);
    expect(ranked[0].id).toBe("2");
    expect(ranked.map((m) => m.id)).toEqual(["2", "3", "1", "4"]);
  });
  it("returns empty when nothing matches", () => {
    const ref: AssetRef = {
      id: "x",
      filename: "a.mp4",
      size: 100,
      mime: "video/mp4",
    };
    expect(matchCandidates(ref, [meta("1", "b.png", 5, "image/png")])).toEqual([]);
  });
});

describe("missingRefs", () => {
  it("reports refs not present locally", () => {
    const refs: AssetRef[] = [
      { id: "a", filename: "a.mp4", size: 1, mime: "video/mp4" },
      { id: "b", filename: "b.mp4", size: 1, mime: "video/mp4" },
    ];
    expect([...missingRefs(refs, [meta("a", "a.mp4", 1)])]).toEqual(["b"]);
  });
});
