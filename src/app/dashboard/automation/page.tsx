"use client";
import * as React from "react";
import useFetch from "@/lib/use-fetch";
import { api } from "@/lib/client";
import { PageHeader, ListSkeleton, ErrorState } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { TagInput } from "@/components/tag-input";
import { useToast } from "@/components/ui/toast";
import { Loader2 } from "lucide-react";

interface Rule {
  minMatchScore: number; maxApplicationsPerDay: number; maxApplicationsPerWeek: number;
  maxApplicationsPerCompany: number; companyWindowDays: number; minSalary: number | null;
  locations: string[]; remoteOnly: boolean; preferredJobTitles: string[];
  excludedJobTitles: string[]; excludedCompanies: string[]; excludedKeywords: string[];
  applyMode: string; followUpIntervalDays: number;
}

export default function AutomationPage() {
  const { data, loading, error, reload } = useFetch<Rule>("/api/automation");
  const { toast } = useToast();
  const [f, setF] = React.useState<Rule | null>(null);
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => { if (data) setF(data); }, [data]);

  async function save() {
    if (!f) return;
    setSaving(true);
    try {
      await api("/api/automation", { method: "PUT", body: JSON.stringify(f) });
      toast({ title: "Automation rules saved", variant: "success" });
      reload();
    } catch (e) { toast({ title: "Save failed", description: (e as Error).message, variant: "error" }); }
    finally { setSaving(false); }
  }

  if (error) return <ErrorState message="Failed to load rules." />;
  if (loading || !f) return <ListSkeleton rows={6} />;
  const num = (k: keyof Rule) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value === "" ? null : Number(e.target.value) } as Rule);

  return (
    <div>
      <PageHeader title="Automation Rules" description="These guardrails are enforced by the service layer, not just the UI." />
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Limits & thresholds</CardTitle></CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-4">
            <Field label="Minimum Match Score (%)"><Input type="number" value={f.minMatchScore} onChange={num("minMatchScore")} /></Field>
            <Field label="Max Applications / Day"><Input type="number" value={f.maxApplicationsPerDay} onChange={num("maxApplicationsPerDay")} /></Field>
            <Field label="Max Applications / Week"><Input type="number" value={f.maxApplicationsPerWeek} onChange={num("maxApplicationsPerWeek")} /></Field>
            <Field label="Max per Company"><Input type="number" value={f.maxApplicationsPerCompany} onChange={num("maxApplicationsPerCompany")} /></Field>
            <Field label="Company window (days)"><Input type="number" value={f.companyWindowDays} onChange={num("companyWindowDays")} /></Field>
            <Field label="Minimum Salary"><Input type="number" value={f.minSalary ?? ""} onChange={num("minSalary")} /></Field>
            <Field label="Follow-up interval (days)"><Input type="number" value={f.followUpIntervalDays} onChange={num("followUpIntervalDays")} /></Field>
            <Field label="Apply mode">
              <select className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={f.applyMode} onChange={(e) => setF({ ...f, applyMode: e.target.value })}>
                <option value="MANUAL">Manual</option>
                <option value="ASSISTED">Assisted</option>
                <option value="AUTO">Auto (only where platform permits)</option>
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={f.remoteOnly} onChange={(e) => setF({ ...f, remoteOnly: e.target.checked })} /> Remote only
            </label>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Targeting & exclusions</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Field label="Locations"><TagInput value={f.locations} onChange={(v) => setF({ ...f, locations: v })} /></Field>
            <Field label="Preferred Job Titles"><TagInput value={f.preferredJobTitles} onChange={(v) => setF({ ...f, preferredJobTitles: v })} /></Field>
            <Field label="Excluded Job Titles"><TagInput value={f.excludedJobTitles} onChange={(v) => setF({ ...f, excludedJobTitles: v })} /></Field>
            <Field label="Excluded Companies (blacklist)"><TagInput value={f.excludedCompanies} onChange={(v) => setF({ ...f, excludedCompanies: v })} /></Field>
            <Field label="Excluded Keywords (blacklist)"><TagInput value={f.excludedKeywords} onChange={(v) => setF({ ...f, excludedKeywords: v })} /></Field>
          </CardContent>
        </Card>
      </div>
      <div className="flex justify-end mt-4"><Button onClick={save} disabled={saving}>{saving && <Loader2 className="animate-spin" />} Save rules</Button></div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
