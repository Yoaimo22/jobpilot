"use client";
import * as React from "react";
import useFetch from "@/lib/use-fetch";
import { api } from "@/lib/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ListSkeleton, ErrorState } from "@/components/shared";
import { useToast } from "@/components/ui/toast";
import type { ComparisonRow, DiffToken } from "@/modules/cv/diff";
import {
  CheckCheck, XCircle, Check, Pencil, RotateCcw, Loader2, Quote, ShieldAlert,
} from "lucide-react";

interface CompareResponse {
  rows: ComparisonRow[];
  summary: { total: number; modified: number; added: number; removed: number; unchanged: number; approved: number };
}

/** Renders one side of the diff, colouring only the tokens relevant to it. */
function DiffText({ tokens, side }: { tokens: DiffToken[]; side: "before" | "after" }) {
  return (
    <span className="text-sm leading-relaxed">
      {tokens.map((t, i) => {
        if (side === "before" && t.op === "added") return null;
        if (side === "after" && t.op === "removed") return null;
        if (t.op === "equal") return <span key={i}>{t.text}</span>;
        if (t.op === "added") {
          return (
            <span key={i} className="bg-green-500/25 text-green-800 dark:text-green-200 rounded px-0.5">
              {t.text}
            </span>
          );
        }
        return (
          <span key={i} className="bg-red-500/25 text-red-800 dark:text-red-200 line-through rounded px-0.5">
            {t.text}
          </span>
        );
      })}
    </span>
  );
}

export function BeforeAfter({
  resumeId,
  jobId,
  onChanged,
}: {
  resumeId: string;
  jobId: string;
  onChanged?: () => void;
}) {
  const url = `/api/cv/compare?resumeId=${resumeId}${jobId ? `&jobId=${jobId}` : ""}`;
  const { data, loading, error, reload } = useFetch<CompareResponse>(url);
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [editing, setEditing] = React.useState<string | null>(null);
  const [editText, setEditText] = React.useState("");
  const [onlyChanged, setOnlyChanged] = React.useState(true);

  const refresh = React.useCallback(() => { reload(); onChanged?.(); }, [reload, onChanged]);

  async function bulk(status: "ACCEPTED" | "REJECTED" | "PENDING", ids?: string[]) {
    setBusy(true);
    try {
      const res = await api<{ updated: number; skippedBlocked: number }>("/api/cv/recommendations/bulk", {
        method: "POST",
        body: JSON.stringify({ resumeId, jobId, status, ids }),
      });
      toast({
        title: `${res.updated} perubahan di-${status === "ACCEPTED" ? "setujui" : status === "REJECTED" ? "tolak" : "reset"}`,
        description: res.skippedBlocked > 0
          ? `${res.skippedBlocked} rekomendasi diblokir sistem dan tidak disertakan.`
          : undefined,
        variant: "success",
      });
      setSelected(new Set());
      refresh();
    } catch (e) {
      toast({ title: "Gagal", description: (e as Error).message, variant: "error" });
    } finally { setBusy(false); }
  }

  async function decideOne(id: string, status: string, chosenText?: string) {
    setBusy(true);
    try {
      await api("/api/cv/recommendations", {
        method: "PATCH", body: JSON.stringify({ id, status, chosenText }),
      });
      setEditing(null);
      refresh();
    } catch (e) {
      toast({ title: "Gagal", description: (e as Error).message, variant: "error" });
    } finally { setBusy(false); }
  }

  if (error) return <ErrorState message={error.message} />;
  if (loading || !data) return <ListSkeleton rows={5} />;

  const rows = onlyChanged
    ? data.rows.filter((r) => r.status !== "unchanged" || r.approved)
    : data.rows;
  const changeable = data.rows.filter((r) => r.recommendationType && r.recommendationType !== "NOT_ALLOWED");

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base">CV Review — Sebelum / Sesudah</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {data.summary.approved} dari {changeable.length} perubahan disetujui ·{" "}
              {data.summary.modified} baris berubah
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" onClick={() => bulk("ACCEPTED")} disabled={busy || !changeable.length}>
              {busy ? <Loader2 className="animate-spin" /> : <CheckCheck className="h-4 w-4" />} Terima semua
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulk("REJECTED")} disabled={busy || !changeable.length}>
              <XCircle className="h-4 w-4" /> Tolak semua
            </Button>
            {selected.size > 0 && (
              <Button size="sm" onClick={() => bulk("ACCEPTED", [...selected])} disabled={busy}>
                <Check className="h-4 w-4" /> Terima terpilih ({selected.size})
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => bulk("PENDING")} disabled={busy}>
              <RotateCcw className="h-4 w-4" /> Undo semua
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded bg-green-500/40" /> Kata ditambahkan (ada buktinya)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded bg-red-500/40" /> Kata dihapus
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded bg-amber-500/40" /> Baris diubah
          </span>
          <label className="flex items-center gap-1.5 ml-auto cursor-pointer">
            <input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} />
            Hanya tampilkan yang berubah
          </label>
        </div>
      </CardHeader>

      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Belum ada perubahan. Buat rekomendasi terlebih dahulu.
          </p>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => {
              const blocked = row.recommendationType === "NOT_ALLOWED";
              const isChange = row.status !== "unchanged";
              const canDecide = !!row.recommendationType && !blocked;

              return (
                <div
                  key={row.id}
                  className={`rounded-lg border ${
                    row.approved ? "border-green-500/40 bg-green-500/5"
                    : blocked ? "border-red-500/40 bg-red-500/5"
                    : isChange ? "border-amber-500/40 bg-amber-500/5"
                    : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-muted/40 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      {canDecide && (
                        <input
                          type="checkbox"
                          checked={selected.has(row.id)}
                          onChange={() => setSelected((p) => {
                            const n = new Set(p);
                            n.has(row.id) ? n.delete(row.id) : n.add(row.id);
                            return n;
                          })}
                          aria-label={`Pilih ${row.section}`}
                        />
                      )}
                      <span className="text-xs font-medium truncate">{row.section}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {row.approved && <Badge variant="success">Disetujui</Badge>}
                      {blocked && <Badge variant="danger" className="gap-1"><ShieldAlert className="h-3 w-3" /> Diblokir</Badge>}
                      {!row.approved && !blocked && isChange && <Badge variant="warning">Diubah</Badge>}
                      {!isChange && !row.approved && <Badge variant="secondary">Tidak berubah</Badge>}
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x">
                    <div className="p-3">
                      <div className="text-xs font-medium text-muted-foreground mb-1.5">CV Asli</div>
                      {row.before ? <DiffText tokens={row.tokens} side="before" /> : <span className="text-xs text-muted-foreground italic">(kosong)</span>}
                    </div>
                    <div className="p-3">
                      <div className="text-xs font-medium text-muted-foreground mb-1.5">CV Optimasi</div>
                      {editing === row.id ? (
                        <div className="space-y-2">
                          <Textarea rows={3} value={editText} onChange={(e) => setEditText(e.target.value)} />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => decideOne(row.id, "MODIFIED", editText)} disabled={busy}>Simpan</Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Batal</Button>
                          </div>
                        </div>
                      ) : (
                        <DiffText tokens={row.tokens} side="after" />
                      )}
                    </div>
                  </div>

                  {row.evidence && row.evidence.length > 0 && (
                    <div className="px-3 pb-2 text-xs text-muted-foreground flex gap-1.5">
                      <Quote className="h-3 w-3 shrink-0 mt-0.5" />
                      <span className="italic">&ldquo;{row.evidence[0].slice(0, 130)}&rdquo;</span>
                    </div>
                  )}

                  {canDecide && editing !== row.id && (
                    <div className="flex gap-2 px-3 pb-3 flex-wrap">
                      {row.approved ? (
                        <Button size="sm" variant="ghost" onClick={() => decideOne(row.id, "PENDING")} disabled={busy}>
                          <RotateCcw className="h-4 w-4" /> Undo
                        </Button>
                      ) : (
                        <>
                          <Button size="sm" onClick={() => decideOne(row.id, "ACCEPTED")} disabled={busy}>
                            <Check className="h-4 w-4" /> Terima
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => decideOne(row.id, "REJECTED")} disabled={busy}>
                            <XCircle className="h-4 w-4" /> Tolak
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm" variant="ghost"
                        onClick={() => { setEditing(row.id); setEditText(row.after || row.before); }}
                      >
                        <Pencil className="h-4 w-4" /> Edit manual
                      </Button>
                    </div>
                  )}

                  {blocked && (
                    <div className="px-3 pb-3 text-xs text-red-700 dark:text-red-400">
                      Sistem memblokir perubahan ini karena mengandung klaim tanpa bukti di CV Anda.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
