"use client";
import * as React from "react";
import Link from "next/link";
import useFetch from "@/lib/use-fetch";
import { api } from "@/lib/client";
import { PageHeader, EmptyState, ListSkeleton, ErrorState } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { scoreVariant } from "@/components/status-meta";
import { useToast } from "@/components/ui/toast";
import { ListChecks, Check, X, SkipForward, ExternalLink, Loader2, AlertTriangle, Info } from "lucide-react";

interface QueueItem {
  id: string; status: string; matchScore: number | null; matchedSkills: string[]; missingSkills: string[];
  jobId: string; jobTitle: string; originalUrl: string | null; sourceName: string;
  supportsAutoApply: boolean; companyName: string; resumeName: string | null;
  allowed: boolean; blocks: string[]; warnings: string[];
}
interface QueueResp { items: QueueItem[]; bulkAllowed: boolean; }

export default function QueuePage() {
  const { data, loading, error, reload } = useFetch<QueueResp>("/api/queue");
  const { toast } = useToast();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);

  const items = data?.items ?? [];
  function toggle(id: string) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function act(ids: string[], action: "approve" | "reject" | "skip") {
    if (!ids.length) return;
    setBusy(true);
    try {
      const res = await api<{ approved: number; blocked: { id: string; reason?: string }[] }>("/api/queue/action", {
        method: "POST", body: JSON.stringify({ applicationIds: ids, action }),
      });
      if (action === "approve") {
        const msg = res.blocked.length ? `${res.approved} approved, ${res.blocked.length} blocked by safety checks` : `${res.approved} approved`;
        toast({ title: msg, variant: res.blocked.length ? "error" : "success" });
      } else {
        toast({ title: `${ids.length} ${action === "reject" ? "rejected" : "skipped"}`, variant: "success" });
      }
      setSelected(new Set());
      reload();
    } catch (e) { toast({ title: "Action failed", description: (e as Error).message, variant: "error" }); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <PageHeader
        title="Application Queue"
        description="Review prepared applications one by one, then approve, reject, or skip."
        action={
          data?.bulkAllowed && selected.size > 0 ? (
            <Button onClick={() => act([...selected], "approve")} disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} Bulk approve ({selected.size})
            </Button>
          ) : undefined
        }
      />

      {!loading && items.length > 0 && !data?.bulkAllowed && (
        <div className="flex items-start gap-2 rounded-lg border border-blue-500/40 bg-blue-500/10 p-3 text-sm text-blue-700 dark:text-blue-400 mb-4">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          Bulk approval is disabled because one or more sources don&apos;t permit automated submission. Approve each item individually — that marks it as applied so you can submit manually on the platform.
        </div>
      )}

      {error ? <ErrorState message="Failed to load queue." /> : loading ? <ListSkeleton rows={4} /> : items.length === 0 ? (
        <EmptyState icon={ListChecks} title="Queue is empty" description="Prepare an application from a job to add it here." />
      ) : (
        <div className="space-y-3">
          {items.map((it) => (
            <Card key={it.id} className={selected.has(it.id) ? "border-primary/50" : ""}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {data?.bulkAllowed && (
                    <input type="checkbox" className="mt-1.5" checked={selected.has(it.id)} onChange={() => toggle(it.id)} aria-label={`Select ${it.jobTitle}`} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/dashboard/applications/${it.id}`} className="font-medium hover:underline">{it.jobTitle}</Link>
                      {it.matchScore != null && <Badge variant={scoreVariant(it.matchScore)}>{it.matchScore}%</Badge>}
                      <span className="text-sm text-muted-foreground">· {it.companyName} · {it.sourceName}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      CV: {it.resumeName ?? "none selected"}
                    </div>
                    {it.blocks.length > 0 && (
                      <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 mt-1.5">
                        <X className="h-3.5 w-3.5" /> Blocked: {it.blocks.join(", ")}
                      </div>
                    )}
                    {it.warnings.length > 0 && (
                      <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 mt-1">
                        <AlertTriangle className="h-3.5 w-3.5" /> {it.warnings.join(", ")}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="default" disabled={busy || !it.allowed} onClick={() => act([it.id], "approve")} title={it.allowed ? "Approve" : "Blocked by safety checks"}>
                      <Check className="h-4 w-4" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => act([it.id], "skip")}><SkipForward className="h-4 w-4" /> Skip</Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => act([it.id], "reject")}><X className="h-4 w-4" /></Button>
                    {it.originalUrl && (
                      <a href={it.originalUrl} target="_blank" rel="noreferrer"><Button size="sm" variant="ghost" title="Open original"><ExternalLink className="h-4 w-4" /></Button></a>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
