import { describe, expect, it } from "vitest";
import { fuseRankings } from "./rankFusion";

describe("fuseRankings", () => {
  it("puts an id found by both lists first", () => {
    expect(fuseRankings(["a", "b", "c"], ["b", "d", "e"])).toEqual([
      "b",
      "a",
      "d",
      "c",
      "e",
    ]);
  });

  it("keeps the order of a single lists", () => {
    expect(fuseRankings(["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("works when the semantic list is empty(embedder down)", () => {
    expect(fuseRankings([], ["b", "d", "e"])).toEqual(["b", "d", "e"]);
  });

  it("retursn each id once", () => {
    expect(fuseRankings(["a", "b"], ["b", "a"])).toHaveLength(2);
  });

  it("returns nothing for empty input", () => {
    expect(fuseRankings([], [])).toEqual([]);
  });
});
