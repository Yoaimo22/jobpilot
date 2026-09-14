/**
 * Word-level diff for the Before / After comparison (spec §18).
 *
 * Colour semantics required by the spec:
 *   added    → green  (wording introduced, backed by evidence)
 *   removed  → red    (text taken out)
 *   equal    → plain
 *
 * A sentence that changed at all is "modified" (yellow) at the row level, while
 * the words inside it are marked added/removed individually.
 */

export type DiffOp = "equal" | "added" | "removed";

export interface DiffToken {
  op: DiffOp;
  text: string;
}

/** Split into words while keeping punctuation attached and spaces recoverable. */
function tokenize(text: string): string[] {
  return text.split(/(\s+)/).filter((t) => t.length > 0);
}

/**
 * Longest-common-subsequence word diff. Input sizes here are single sentences,
 * so the O(n·m) table is small and exact output is preferable to a heuristic.
 */
export function diffWords(before: string, after: string): DiffToken[] {
  const a = tokenize(before);
  const b = tokenize(after);

  // Guard against pathological inputs.
  if (a.length * b.length > 250_000) {
    return [
      { op: "removed", text: before },
      { op: "added", text: after },
    ];
  }

  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const out: DiffToken[] = [];
  let i = 0;
  let j = 0;
  const push = (op: DiffOp, text: string) => {
    const last = out[out.length - 1];
    if (last && last.op === op) last.text += text;
    else out.push({ op, text });
  };

  while (i < n && j < m) {
    if (a[i] === b[j]) { push("equal", a[i]); i++; j++; }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) { push("removed", a[i]); i++; }
    else { push("added", b[j]); j++; }
  }
  while (i < n) { push("removed", a[i]); i++; }
  while (j < m) { push("added", b[j]); j++; }

  return out;
}

export type RowStatus = "unchanged" | "modified" | "added" | "removed";

export interface ComparisonRow {
  /** Stable key — the recommendation id when the row came from one. */
  id: string;
  section: string;
  before: string;
  after: string;
  status: RowStatus;
  tokens: DiffToken[];
  /** Whether the change is currently approved by the user. */
  approved: boolean;
  recommendationType?: string;
  evidence?: string[];
}

/** Build a comparison row, classifying it and computing the inline diff. */
export function buildRow(params: {
  id: string;
  section: string;
  before: string;
  after: string;
  approved: boolean;
  recommendationType?: string;
  evidence?: string[];
}): ComparisonRow {
  const { before, after } = params;
  const status: RowStatus =
    !before.trim() && after.trim() ? "added"
    : before.trim() && !after.trim() ? "removed"
    : before.trim() === after.trim() ? "unchanged"
    : "modified";

  return {
    ...params,
    status,
    tokens: status === "unchanged" ? [{ op: "equal", text: before }] : diffWords(before, after),
  };
}

/** Summary counts for the comparison header. */
export function summarize(rows: ComparisonRow[]) {
  return {
    total: rows.length,
    modified: rows.filter((r) => r.status === "modified").length,
    added: rows.filter((r) => r.status === "added").length,
    removed: rows.filter((r) => r.status === "removed").length,
    unchanged: rows.filter((r) => r.status === "unchanged").length,
    approved: rows.filter((r) => r.approved).length,
  };
}
