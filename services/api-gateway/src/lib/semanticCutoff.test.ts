import { describe, expect, it } from "vitest";
import { keepCloseMatches } from "./semanticCutoff";

const rows = (sims: number[]) =>
  sims.map((sim, i) => ({ id: `video${i}`, sim }));

describe("keepCloseMatches", () => {
  it("keeps matches within 0.2 of the best one", () => {
    const r = rows([
      0.728, 0.693, 0.615, 0.602, 0.557, 0.546, 0.329, 0.313, 0.304,
    ]);
    expect(keepCloseMatches(r)).toHaveLength(6);
  });

  it("uses the 0.3 floor when the best match is weak", () => {
    const r = rows([0.482, 0.377, 0.33, 0.284]);
    expect(keepCloseMatches(r)).toEqual(["video0", "video1", "video2"]);
  });

  it("returns nothing for no matches", () => {
    expect(keepCloseMatches([])).toEqual([]);
  });
});
