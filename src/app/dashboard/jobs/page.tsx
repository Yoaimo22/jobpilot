"use client";
import * as React from "react";
import Link from "next/link";
import useFetch from "@/lib/use-fetch";
import { api } from "@/lib/client";
import { PageHeader, EmptyState, ListSkeleton, ErrorState } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TagInput } from "@/components/tag-input";
import { scoreVariant } from "@/components/status-meta";
import { useToast } from "@/components/ui/toast";
import { formatCurrency } from "@/lib/utils";
import { Briefcase, Plus, Search, Loader2, X } from "lucide-react";

interface JobRow {
  id: string; title: string; location: string | null; matchScore: number | null;
  salaryMin: number | null; salaryMax: number | null; currency: string;
  workplaceType: string; company: { name: string } | null;
  source: { name: string } | null; applications: { id: string; status: string }[];
}

const SOURCES = ["manual", "linkedin", "indeed", "jobstreet", "glints", "kalibrr", "company"];
const WORKPLACES = ["UNKNOWN", "REMOTE", "HYBRID", "ONSITE"];
const EMPLOYMENTS = ["UNKNOWN", "FULL_TIME", "PART_TIME", "CONTRACT", "INTERNSHIP", "FREELANCE"];

export default function JobsPage() {
  const [q, setQ] = React.useState("");
  const { data, loading, error, reload } = useFetch<JobRow[]>(`/api/jobs${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  const [showForm, setShowForm] = React.useState(false);

  return (
    <div>
      <PageHeader
        title="Jobs"
        description="Import or add jobs. Each is scored against your profile automatically."
        action={<Button onClick={() => setShowForm((v) => !v)}>{showForm ? <X /> : <Plus />} {showForm ? "Close" : "Add job"}</Button>}
      />

      {showForm && <AddJobForm onDone={() => { setShowForm(false); reload(); }} />}

      <div className="relative mb-4 mt-2">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search title, company, location…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>

      {error ? (
        <ErrorState message="Failed to load jobs." />
      ) : loading ? (
        <ListSkeleton rows={5} />
      ) : (data?.length ?? 0) === 0 ? (
        <EmptyState icon={Briefcase} title="No jobs yet" description="Add a job manually or import one to start matching." />
      ) : (
        <div className="grid gap-2">
          {data!.map((j) => (
            <Link key={j.id} href={`/dashboard/jobs/${j.id}`}>
              <Card className="hover:border-primary/50 transition-colors">
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{j.title}</div>
                    <div className="text-sm text-muted-foreground truncate">
                      {j.company?.name} · {j.location ?? "—"} · {j.workplaceType.toLowerCase()}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {formatCurrency(j.salaryMax ?? j.salaryMin, j.currency)} · {j.source?.name ?? "Manual"}
                      {j.applications.length > 0 && " · Applied"}
                    </div>
                  </div>
                  {j.matchScore != null && (
                    <Badge variant={scoreVariant(j.matchScore)} className="text-sm shrink-0">{j.matchScore}%</Badge>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function AddJobForm({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const [saving, setSaving] = React.useState(false);
  const [f, setF] = React.useState({
    title: "", companyName: "", location: "", workplaceType: "UNKNOWN",
    employmentType: "UNKNOWN", salaryMin: "", salaryMax: "", currency: "IDR",
    description: "", requirements: "", originalUrl: "", sourceKey: "manual",
    seniority: "", industry: "", experienceYears: "",
  });
  const [requiredSkills, setRequiredSkills] = React.useState<string[]>([]);
  const [preferredSkills, setPreferredSkills] = React.useState<string[]>([]);

  async function submit() {
    if (!f.title.trim() || !f.companyName.trim()) {
      toast({ title: "Title and company are required", variant: "error" });
      return;
    }
    setSaving(true);
    try {
      const res = await api<{ match: { score: number } }>("/api/jobs", {
        method: "POST",
        body: JSON.stringify({
          ...f,
          salaryMin: f.salaryMin ? Number(f.salaryMin) : null,
          salaryMax: f.salaryMax ? Number(f.salaryMax) : null,
          experienceYears: f.experienceYears ? Number(f.experienceYears) : null,
          requiredSkills, preferredSkills,
        }),
      });
      toast({ title: `Job added — ${res.match.score}% match`, variant: "success" });
      onDone();
    } catch (e) {
      toast({ title: "Failed to add job", description: (e as Error).message, variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <Card className="mb-4">
      <CardHeader><CardTitle className="text-base">Add a job</CardTitle></CardHeader>
      <CardContent className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5"><Label>Job title *</Label><Input value={f.title} onChange={set("title")} /></div>
        <div className="space-y-1.5"><Label>Company *</Label><Input value={f.companyName} onChange={set("companyName")} /></div>
        <div className="space-y-1.5"><Label>Location</Label><Input value={f.location} onChange={set("location")} /></div>
        <div className="space-y-1.5">
          <Label>Source</Label>
          <select className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={f.sourceKey} onChange={set("sourceKey")}>
            {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Workplace</Label>
          <select className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={f.workplaceType} onChange={set("workplaceType")}>
            {WORKPLACES.map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Employment</Label>
          <select className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={f.employmentType} onChange={set("employmentType")}>
            {EMPLOYMENTS.map((s) => <option key={s} value={s}>{s.toLowerCase().replace("_", " ")}</option>)}
          </select>
        </div>
        <div className="space-y-1.5"><Label>Salary min</Label><Input type="number" value={f.salaryMin} onChange={set("salaryMin")} /></div>
        <div className="space-y-1.5"><Label>Salary max</Label><Input type="number" value={f.salaryMax} onChange={set("salaryMax")} /></div>
        <div className="space-y-1.5"><Label>Seniority</Label><Input value={f.seniority} onChange={set("seniority")} placeholder="Junior / Mid / Senior" /></div>
        <div className="space-y-1.5"><Label>Industry</Label><Input value={f.industry} onChange={set("industry")} /></div>
        <div className="space-y-1.5"><Label>Experience (years)</Label><Input type="number" value={f.experienceYears} onChange={set("experienceYears")} /></div>
        <div className="space-y-1.5"><Label>Original URL</Label><Input value={f.originalUrl} onChange={set("originalUrl")} /></div>
        <div className="sm:col-span-2 space-y-1.5"><Label>Required skills</Label><TagInput value={requiredSkills} onChange={setRequiredSkills} placeholder="e.g. Node.js" /></div>
        <div className="sm:col-span-2 space-y-1.5"><Label>Preferred skills</Label><TagInput value={preferredSkills} onChange={setPreferredSkills} /></div>
        <div className="sm:col-span-2 space-y-1.5"><Label>Description</Label><Textarea value={f.description} onChange={set("description")} rows={3} /></div>
        <div className="sm:col-span-2 flex justify-end">
          <Button onClick={submit} disabled={saving}>{saving && <Loader2 className="animate-spin" />} Save & score</Button>
        </div>
      </CardContent>
    </Card>
  );
}
