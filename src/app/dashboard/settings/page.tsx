"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import useFetch from "@/lib/use-fetch";
import { api } from "@/lib/client";
import { PageHeader, ListSkeleton, ErrorState } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { TagInput } from "@/components/tag-input";
import { useToast } from "@/components/ui/toast";
import { Loader2, AlertTriangle } from "lucide-react";

interface Pref {
  expectedSalaryMin: number | null; expectedSalaryMax: number | null; currency: string;
  employmentTypes: string[]; workplaceTypes: string[]; targetLocations: string[];
  targetIndustries: string[]; targetJobTitles: string[]; seniority: string[];
  avoidedCompanies: string[]; avoidedKeywords: string[]; requiredSkills: string[];
}

export default function SettingsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { data, loading, error, reload } = useFetch<Pref>("/api/preferences");
  const [f, setF] = React.useState<Pref | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [confirm, setConfirm] = React.useState("");
  React.useEffect(() => { if (data) setF(data); }, [data]);

  async function save() {
    if (!f) return;
    setSaving(true);
    try {
      await api("/api/preferences", { method: "PUT", body: JSON.stringify(f) });
      toast({ title: "Preferences saved", variant: "success" }); reload();
    } catch (e) { toast({ title: "Save failed", description: (e as Error).message, variant: "error" }); }
    finally { setSaving(false); }
  }

  async function deleteData() {
    if (confirm !== "DELETE") return;
    await api("/api/privacy/delete", { method: "POST", body: JSON.stringify({}) });
    toast({ title: "All your data has been deleted", variant: "success" });
    router.push("/dashboard"); router.refresh();
  }

  if (error) return <ErrorState message="Failed to load settings." />;
  if (loading || !f) return <ListSkeleton rows={6} />;

  return (
    <div>
      <PageHeader title="Settings" description="Job preferences and privacy controls." />
      <Card className="mb-4">
        <CardHeader><CardTitle className="text-base">Job Preferences</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5"><Label>Expected salary min</Label><Input type="number" value={f.expectedSalaryMin ?? ""} onChange={(e) => setF({ ...f, expectedSalaryMin: e.target.value ? Number(e.target.value) : null })} /></div>
          <div className="space-y-1.5"><Label>Expected salary max</Label><Input type="number" value={f.expectedSalaryMax ?? ""} onChange={(e) => setF({ ...f, expectedSalaryMax: e.target.value ? Number(e.target.value) : null })} /></div>
          <div className="sm:col-span-2 space-y-1.5"><Label>Target job titles</Label><TagInput value={f.targetJobTitles} onChange={(v) => setF({ ...f, targetJobTitles: v })} placeholder="e.g. Backend Engineer" /></div>
          <div className="sm:col-span-2 space-y-1.5"><Label>Target locations</Label><TagInput value={f.targetLocations} onChange={(v) => setF({ ...f, targetLocations: v })} /></div>
          <div className="sm:col-span-2 space-y-1.5"><Label>Target industries</Label><TagInput value={f.targetIndustries} onChange={(v) => setF({ ...f, targetIndustries: v })} /></div>
          <div className="space-y-1.5"><Label>Employment types</Label><TagInput value={f.employmentTypes} onChange={(v) => setF({ ...f, employmentTypes: v })} placeholder="FULL_TIME…" /></div>
          <div className="space-y-1.5"><Label>Workplace types</Label><TagInput value={f.workplaceTypes} onChange={(v) => setF({ ...f, workplaceTypes: v })} placeholder="REMOTE / HYBRID / ONSITE" /></div>
          <div className="space-y-1.5"><Label>Seniority</Label><TagInput value={f.seniority} onChange={(v) => setF({ ...f, seniority: v })} placeholder="JUNIOR / MID / SENIOR" /></div>
          <div className="space-y-1.5"><Label>Required skills (must-have)</Label><TagInput value={f.requiredSkills} onChange={(v) => setF({ ...f, requiredSkills: v })} /></div>
        </CardContent>
      </Card>
      <div className="flex justify-end mb-8"><Button onClick={save} disabled={saving}>{saving && <Loader2 className="animate-spin" />} Save preferences</Button></div>

      <Card className="border-destructive/40">
        <CardHeader><CardTitle className="text-base flex items-center gap-2 text-destructive"><AlertTriangle className="h-4 w-4" /> Privacy — Delete My Data</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">This permanently deletes all your jobs, applications, companies, CVs, and notifications. Your account stays so you can start over. Type <code className="font-mono font-semibold">DELETE</code> to confirm.</p>
          <div className="flex gap-2 max-w-sm">
            <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Type DELETE" />
            <Button variant="destructive" onClick={deleteData} disabled={confirm !== "DELETE"}>Delete all my data</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
