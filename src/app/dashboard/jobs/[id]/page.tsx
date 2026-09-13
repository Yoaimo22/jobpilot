"use client";
import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import useFetch from "@/lib/use-fetch";
import { api } from "@/lib/client";
import { PageHeader, ErrorState, ListSkeleton } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/feedback";
import { scoreVariant } from "@/components/status-meta";
import { useToast } from "@/components/ui/toast";
import { formatCurrency } from "@/lib/utils";
import { CheckCircle2, XCircle, AlertTriangle, Info, RefreshCw, Send, Loader2, ExternalLink } from "lucide-react";

interface MatchReasons {
  score: number; summary: string; matchedSkills: string[]; missingSkills: string[];
  dimensions: { key: string; label: string; weight: number; score: number; detail: string }[];
}
interface Job {
  id: string; title: string; location: string | null; matchScore: number | null;
  matchReasons: MatchReasons | null; salaryMin: number | null; salaryMax: number | null;
  currency: string; workplaceType: string; employmentType: string; description: string | null;
  requirements: string | null; originalUrl: string | null; seniority: string | null;
  industry: string | null; company: { id: string; name: string } | null;
  jobSkills: { skill: { name: string } }[]; applications: { id: string; status: string }[];
}
interface GuardCheck { key: string; label: string; passed: boolean; severity: string; detail: string; }
interface Guard { allowed: boolean; hasWarnings: boolean; checks: GuardCheck[]; duplicate?: { applicationId: string }; }

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const { data: job, loading, error, reload } = useFetch<Job>(`/api/jobs/${id}`);
  const [guard, setGuard] = React.useState<Guard | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function recompute() {
    setBusy(true);
    try {
      await api(`/api/jobs/${id}`, { method: "POST" });
      toast({ title: "Match score recomputed", variant: "success" });
      reload();
    } finally { setBusy(false); }
  }

  async function checkGuard() {
    setBusy(true);
    try {
      const g = await api<Guard>("/api/applications/guard", { method: "POST", body: JSON.stringify({ jobId: id }) });
      setGuard(g);
    } finally { setBusy(false); }
  }

  async function apply(force = false) {
    setBusy(true);
    try {
      const res = await api<{ applicationId: string }>("/api/applications", {
        method: "POST", body: JSON.stringify({ jobId: id, force }),
      });
      toast({ title: "Application prepared", variant: "success" });
      router.push(`/dashboard/applications/${res.applicationId}`);
    } catch (e) {
      // guard block returns structured error
      const msg = (e as Error).message;
      toast({ title: "Cannot apply", description: msg, variant: "error" });
      checkGuard();
    } finally { setBusy(false); }
  }

  if (error) return <ErrorState message="Failed to load job." />;
  if (loading || !job) return <ListSkeleton rows={6} />;

  const reasons = job.matchReasons;
  const alreadyApplied = job.applications.length > 0;

  return (
    <div>
      <PageHeader
        title={job.title}
        description={`${job.company?.name ?? ""} · ${job.location ?? "—"} · ${job.workplaceType.toLowerCase()}`}
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={recompute} disabled={busy}><RefreshCw className="h-4 w-4" /> Recompute</Button>
            {alreadyApplied ? (
              <Button onClick={() => router.push(`/dashboard/applications/${job.applications[0].id}`)}>View application</Button>
            ) : (
              <Button onClick={checkGuard} disabled={busy}>{busy && <Loader2 className="animate-spin" />} Prepare to apply</Button>
            )}
          </div>
        }
      />

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Match analysis</CardTitle>
              {job.matchScore != null && <Badge variant={scoreVariant(job.matchScore)} className="text-base">{job.matchScore}%</Badge>}
            </CardHeader>
            <CardContent>
              {!reasons ? (
                <p className="text-sm text-muted-foreground">No match computed yet.</p>
              ) : (
                <>
                  <p className="text-sm mb-4">{reasons.summary}</p>
                  <div className="grid sm:grid-cols-2 gap-3 mb-4">
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-1.5">Matched skills</div>
                      <div className="flex flex-wrap gap-1">
                        {reasons.matchedSkills.length ? reasons.matchedSkills.map((s) => <Badge key={s} variant="success">{s}</Badge>) : <span className="text-xs text-muted-foreground">None</span>}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-1.5">Missing skills</div>
                      <div className="flex flex-wrap gap-1">
                        {reasons.missingSkills.length ? reasons.missingSkills.map((s) => <Badge key={s} variant="danger">{s}</Badge>) : <span className="text-xs text-muted-foreground">None</span>}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    {reasons.dimensions.map((d) => (
                      <div key={d.key}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium">{d.label} <span className="text-muted-foreground">({Math.round(d.weight * 100)}%)</span></span>
                          <span className="text-muted-foreground">{d.detail}</span>
                        </div>
                        <Progress value={d.score * 100} />
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {job.description && (
            <Card>
              <CardHeader><CardTitle className="text-base">Description</CardTitle></CardHeader>
              <CardContent><p className="text-sm whitespace-pre-wrap text-muted-foreground">{job.description}</p></CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Salary" value={formatCurrency(job.salaryMax ?? job.salaryMin, job.currency)} />
              <Row label="Employment" value={job.employmentType.toLowerCase().replace("_", " ")} />
              <Row label="Seniority" value={job.seniority ?? "—"} />
              <Row label="Industry" value={job.industry ?? "—"} />
              <Row label="Required skills" value={job.jobSkills.map((s) => s.skill.name).join(", ") || "—"} />
              {job.originalUrl && (
                <a href={job.originalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline text-sm pt-1">
                  Original posting <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </CardContent>
          </Card>

          {guard && (
            <Card>
              <CardHeader><CardTitle className="text-base">Pre-apply checks</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {guard.checks.map((c) => (
                  <div key={c.key} className="flex items-start gap-2 text-sm">
                    {c.passed ? <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                      : c.severity === "block" ? <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                      : c.severity === "warn" ? <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                      : <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />}
                    <div>
                      <div className="font-medium">{c.label}</div>
                      <div className="text-xs text-muted-foreground">{c.detail}</div>
                    </div>
                  </div>
                ))}
                <div className="pt-2">
                  {guard.duplicate ? (
                    <Button variant="outline" className="w-full" onClick={() => router.push(`/dashboard/applications/${guard.duplicate!.applicationId}`)}>
                      View existing application
                    </Button>
                  ) : guard.allowed ? (
                    <Button className="w-full" onClick={() => apply(false)} disabled={busy}>
                      {busy && <Loader2 className="animate-spin" />} <Send className="h-4 w-4" /> Prepare application
                    </Button>
                  ) : (
                    <p className="text-xs text-destructive text-center">Blocked by a safety check above.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
