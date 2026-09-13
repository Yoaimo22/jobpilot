"use client";
import * as React from "react";
import { useParams } from "next/navigation";
import useFetch from "@/lib/use-fetch";
import { api } from "@/lib/client";
import { PageHeader, ErrorState, ListSkeleton } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { STATUS_META, ALL_STATUSES, scoreVariant } from "@/components/status-meta";
import { useToast } from "@/components/ui/toast";
import { formatCurrency, formatDate } from "@/lib/utils";
import { FileText, Loader2, Wand2, ExternalLink } from "lucide-react";

interface Event { id: string; action: string; oldValue: string | null; newValue: string | null; actor: string; createdAt: string; }
interface Detail {
  id: string; status: string; matchScore: number | null; matchedSkills: string[]; missingSkills: string[];
  coverLetter: string | null; appliedAt: string | null; createdAt: string;
  job: { title: string; description: string | null; originalUrl: string | null; salaryMin: number | null; salaryMax: number | null; currency: string; location: string | null; source: { name: string } | null } | null;
  company: { name: string } | null; resume: { name: string } | null;
  events: Event[]; notes: { id: string; content: string; createdAt: string }[];
}

export default function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { data: app, loading, error, reload } = useFetch<Detail>(`/api/applications/${id}`);
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [cover, setCover] = React.useState<string | null>(null);

  React.useEffect(() => { if (app) setCover(app.coverLetter); }, [app]);

  async function changeStatus(status: string) {
    setBusy(true);
    try {
      await api(`/api/applications/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      toast({ title: `Status → ${STATUS_META[status]?.label}`, variant: "success" });
      reload();
    } catch (e) { toast({ title: "Failed", description: (e as Error).message, variant: "error" }); }
    finally { setBusy(false); }
  }

  async function genCover() {
    setBusy(true);
    try {
      const res = await api<{ coverLetter: string }>("/api/applications/cover-letter", { method: "POST", body: JSON.stringify({ applicationId: id }) });
      setCover(res.coverLetter);
      toast({ title: "Cover letter generated", variant: "success" });
    } catch (e) { toast({ title: "Failed", description: (e as Error).message, variant: "error" }); }
    finally { setBusy(false); }
  }

  async function saveCover() {
    await api("/api/applications/cover-letter", { method: "PUT", body: JSON.stringify({ applicationId: id, coverLetter: cover ?? "" }) });
    toast({ title: "Cover letter saved", variant: "success" });
  }

  async function addNote() {
    if (!note.trim()) return;
    await api(`/api/applications/${id}/notes`, { method: "POST", body: JSON.stringify({ content: note }) });
    setNote(""); reload();
  }

  if (error) return <ErrorState message="Failed to load application." />;
  if (loading || !app) return <ListSkeleton rows={6} />;

  return (
    <div>
      <PageHeader
        title={app.job?.title ?? "Application"}
        description={`${app.company?.name ?? ""} · applied ${app.appliedAt ? formatDate(app.appliedAt) : "not yet"}`}
        action={<Badge variant={STATUS_META[app.status]?.variant} className="text-sm">{STATUS_META[app.status]?.label}</Badge>}
      />

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Update status</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {ALL_STATUSES.map((s) => (
                  <Button key={s} size="sm" variant={app.status === s ? "default" : "outline"} disabled={busy} onClick={() => changeStatus(s)}>
                    {STATUS_META[s].label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Cover letter</CardTitle>
              <Button size="sm" variant="outline" onClick={genCover} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Wand2 className="h-4 w-4" />} Generate</Button>
            </CardHeader>
            <CardContent>
              <Textarea rows={10} value={cover ?? ""} onChange={(e) => setCover(e.target.value)} placeholder="Generate or write a cover letter. It only uses skills you actually have." />
              <div className="flex justify-end mt-2"><Button size="sm" onClick={saveCover}>Save</Button></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Timeline</CardTitle></CardHeader>
            <CardContent>
              <ol className="relative border-l pl-4 space-y-3">
                {app.events.map((e) => (
                  <li key={e.id} className="relative">
                    <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-primary" />
                    <div className="text-sm font-medium">{e.action}{e.newValue ? `: ${e.newValue}` : ""}</div>
                    <div className="text-xs text-muted-foreground">{new Date(e.createdAt).toLocaleString()} · {e.actor}</div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" />
                <Button onClick={addNote}>Add</Button>
              </div>
              {app.notes.map((n) => (
                <div key={n.id} className="rounded-lg border p-3 text-sm">
                  {n.content}
                  <div className="text-xs text-muted-foreground mt-1">{formatDate(n.createdAt)}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Summary</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Match score" value={app.matchScore != null ? `${app.matchScore}%` : "—"} badge={app.matchScore != null ? scoreVariant(app.matchScore) : undefined} />
              <Row label="CV used" value={app.resume?.name ?? "—"} />
              <Row label="Salary" value={formatCurrency(app.job?.salaryMax ?? app.job?.salaryMin, app.job?.currency)} />
              <Row label="Location" value={app.job?.location ?? "—"} />
              <Row label="Source" value={app.job?.source?.name ?? "Manual"} />
              <div>
                <div className="text-muted-foreground mb-1">Matched skills</div>
                <div className="flex flex-wrap gap-1">{app.matchedSkills.map((s) => <Badge key={s} variant="success">{s}</Badge>)}</div>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">Missing skills</div>
                <div className="flex flex-wrap gap-1">{app.missingSkills.map((s) => <Badge key={s} variant="danger">{s}</Badge>)}</div>
              </div>
              {app.job?.originalUrl && (
                <a href={app.job.originalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline pt-1">
                  Original posting <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, badge }: { label: string; value: string; badge?: "default" | "success" | "info" | "warning" | "danger" | "secondary" | "outline" }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      {badge ? <Badge variant={badge}>{value}</Badge> : <span className="font-medium text-right">{value}</span>}
    </div>
  );
}
