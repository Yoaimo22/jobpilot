"use client";
import * as React from "react";
import useSWRLike from "@/lib/use-fetch";
import { api } from "@/lib/client";
import { PageHeader, ErrorState, ListSkeleton } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TagInput } from "@/components/tag-input";
import { ExperienceEditor, EducationEditor, CertificationEditor } from "@/components/profile-editors";
import { useToast } from "@/components/ui/toast";
import { Loader2, Trash2, Plus } from "lucide-react";

interface Profile {
  fullName: string | null; email: string | null; phone: string | null;
  location: string | null; linkedinUrl: string | null; portfolioUrl: string | null;
  githubUrl: string | null; professionalSummary: string | null; languages: string[];
}
interface Skill { id: string; name: string; level: string; years: number | null; }

const LEVELS = ["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"];

export default function ProfilePage() {
  const { data: profile, error: pErr, loading: pLoad, reload } = useSWRLike<Profile | null>("/api/profile");
  const { data: skills, loading: sLoad, reload: reloadSkills } = useSWRLike<Skill[]>("/api/skills");
  const { toast } = useToast();

  const [form, setForm] = React.useState<Profile | null>(null);
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => {
    if (profile !== undefined)
      setForm(
        profile ?? {
          fullName: "", email: "", phone: "", location: "", linkedinUrl: "",
          portfolioUrl: "", githubUrl: "", professionalSummary: "", languages: [],
        }
      );
  }, [profile]);

  const [newSkill, setNewSkill] = React.useState({ name: "", level: "INTERMEDIATE", years: "" });

  async function saveProfile() {
    if (!form) return;
    setSaving(true);
    try {
      await api("/api/profile", { method: "PUT", body: JSON.stringify(form) });
      toast({ title: "Profile saved", variant: "success" });
      reload();
    } catch (e) {
      toast({ title: "Save failed", description: (e as Error).message, variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function addSkill() {
    if (!newSkill.name.trim()) return;
    try {
      await api("/api/skills", {
        method: "POST",
        body: JSON.stringify({
          name: newSkill.name,
          level: newSkill.level,
          years: newSkill.years ? Number(newSkill.years) : null,
        }),
      });
      setNewSkill({ name: "", level: "INTERMEDIATE", years: "" });
      reloadSkills();
    } catch (e) {
      toast({ title: "Failed to add skill", description: (e as Error).message, variant: "error" });
    }
  }

  async function removeSkill(id: string) {
    await api(`/api/skills/${id}`, { method: "DELETE" });
    reloadSkills();
  }

  if (pErr) return <ErrorState message="Failed to load profile." />;

  return (
    <div>
      <PageHeader title="Profile" description="Your personal and professional information." />

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Personal details</CardTitle></CardHeader>
            <CardContent>
              {pLoad || !form ? (
                <ListSkeleton rows={4} />
              ) : (
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Full name" value={form.fullName} onChange={(v) => setForm({ ...form, fullName: v })} />
                  <Field label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
                  <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
                  <Field label="Location" value={form.location} onChange={(v) => setForm({ ...form, location: v })} />
                  <Field label="LinkedIn URL" value={form.linkedinUrl} onChange={(v) => setForm({ ...form, linkedinUrl: v })} />
                  <Field label="Portfolio URL" value={form.portfolioUrl} onChange={(v) => setForm({ ...form, portfolioUrl: v })} />
                  <Field label="GitHub URL" value={form.githubUrl} onChange={(v) => setForm({ ...form, githubUrl: v })} />
                  <div className="sm:col-span-2 space-y-1.5">
                    <Label>Professional summary</Label>
                    <Textarea
                      value={form.professionalSummary ?? ""}
                      onChange={(e) => setForm({ ...form, professionalSummary: e.target.value })}
                      rows={4}
                    />
                  </div>
                  <div className="sm:col-span-2 space-y-1.5">
                    <Label>Languages</Label>
                    <TagInput value={form.languages} onChange={(v) => setForm({ ...form, languages: v })} placeholder="e.g. English, Indonesian" />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          <div className="flex justify-end">
            <Button onClick={saveProfile} disabled={saving || !form}>
              {saving && <Loader2 className="animate-spin" />} Save profile
            </Button>
          </div>

          <ExperienceEditor />
          <EducationEditor />
          <CertificationEditor />
        </div>

        <Card className="h-fit">
          <CardHeader><CardTitle className="text-base">Skills</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Input placeholder="Skill name" value={newSkill.name} onChange={(e) => setNewSkill({ ...newSkill, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && addSkill()} />
              <div className="flex gap-2">
                <select
                  className="flex h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                  value={newSkill.level}
                  onChange={(e) => setNewSkill({ ...newSkill, level: e.target.value })}
                >
                  {LEVELS.map((l) => <option key={l} value={l}>{l[0] + l.slice(1).toLowerCase()}</option>)}
                </select>
                <Input type="number" placeholder="Yrs" className="w-16" value={newSkill.years} onChange={(e) => setNewSkill({ ...newSkill, years: e.target.value })} />
                <Button size="icon" onClick={addSkill} aria-label="Add skill"><Plus className="h-4 w-4" /></Button>
              </div>
            </div>
            {sLoad ? (
              <ListSkeleton rows={3} />
            ) : (skills?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No skills yet.</p>
            ) : (
              <div className="space-y-1.5">
                {skills!.map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                    <div>
                      <span className="text-sm font-medium">{s.name}</span>
                      <div className="text-xs text-muted-foreground">
                        {s.level[0] + s.level.slice(1).toLowerCase()}{s.years != null ? ` · ${s.years}y` : ""}
                      </div>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => removeSkill(s.id)} aria-label={`Remove ${s.name}`}>
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
