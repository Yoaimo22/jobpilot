import { describe, it, expect } from "vitest";
import { diffWords, buildRow, summarize } from "@/modules/cv/diff";

describe("diffWords", () => {
  it("marks everything equal for identical text", () => {
    const t = diffWords("Developed REST API.", "Developed REST API.");
    expect(t.every((x) => x.op === "equal")).toBe(true);
  });

  it("marks inserted words as added and keeps the rest equal", () => {
    const t = diffWords("Developed API using Node.js.", "Developed RESTful API using Node.js.");
    const added = t.filter((x) => x.op === "added").map((x) => x.text).join("");
    expect(added).toContain("RESTful");
    expect(t.some((x) => x.op === "equal" && x.text.includes("Node.js"))).toBe(true);
  });

  it("marks deleted words as removed", () => {
    const t = diffWords("Responsible for building the API.", "Built the API.");
    const removed = t.filter((x) => x.op === "removed").map((x) => x.text).join("");
    expect(removed).toMatch(/Responsible|for|building/);
  });

  it("reconstructs both sides exactly", () => {
    const before = "Helped build internal dashboard using React.";
    const after = "Contributed to developing internal dashboards using React.";
    const t = diffWords(before, after);
    const rebuiltBefore = t.filter((x) => x.op !== "added").map((x) => x.text).join("");
    const rebuiltAfter = t.filter((x) => x.op !== "removed").map((x) => x.text).join("");
    expect(rebuiltBefore).toBe(before);
    expect(rebuiltAfter).toBe(after);
  });

  it("falls back safely on very large inputs", () => {
    const big = "word ".repeat(800);
    const t = diffWords(big, big + "extra");
    expect(t.length).toBeGreaterThan(0);
  });
});

describe("buildRow", () => {
  it("classifies an unchanged row", () => {
    const r = buildRow({ id: "1", section: "s", before: "Same text.", after: "Same text.", approved: false });
    expect(r.status).toBe("unchanged");
  });

  it("classifies a modified row", () => {
    const r = buildRow({ id: "1", section: "s", before: "Made API.", after: "Built API.", approved: true });
    expect(r.status).toBe("modified");
    expect(r.approved).toBe(true);
  });

  it("classifies an added row when the original was empty", () => {
    const r = buildRow({ id: "1", section: "s", before: "", after: "New summary.", approved: false });
    expect(r.status).toBe("added");
  });

  it("classifies a removed row when the replacement is empty", () => {
    const r = buildRow({ id: "1", section: "s", before: "Old line.", after: "", approved: false });
    expect(r.status).toBe("removed");
  });
});

describe("summarize", () => {
  it("counts rows by status and approval", () => {
    const rows = [
      buildRow({ id: "1", section: "s", before: "a b", after: "a c", approved: true }),
      buildRow({ id: "2", section: "s", before: "x", after: "x", approved: false }),
      buildRow({ id: "3", section: "s", before: "", after: "new", approved: false }),
    ];
    const s = summarize(rows);
    expect(s.total).toBe(3);
    expect(s.modified).toBe(1);
    expect(s.unchanged).toBe(1);
    expect(s.added).toBe(1);
    expect(s.approved).toBe(1);
  });
});
