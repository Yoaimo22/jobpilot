"use client";
import * as React from "react";
import useFetch from "@/lib/use-fetch";
import { api } from "@/lib/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ListSkeleton } from "@/components/shared";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";
import { Plus, Pencil, Trash2, Loader2, X } from "lucide-react";

// ─────────── Experience ───────────
interface Experience {
  id: string; title: string; company: string; location: string | null;
  startDate: string | null; endDate: string | null; current: boolean; description: string | null;
}
const emptyExp = { title: "", company: "", location: "", startDate: "", endDate: "", current: false, description: "" };

export function ExperienceEditor() {
  const { data, loading, reload } = useFetch<Experience[]>("/api/profile/experience");
  const { toast } = useToast();
  const [form, setForm] = React.useState<typeof emptyExp | null>(null);
  const [editId, setEditId] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  function startEdit(e: Experience) {
    setEditId(e.id);
    setForm({
      title: e.title, company: e.company, location: e.location ?? "",
      startDate: e.startDate?.slice(0, 10) ?? "", endDate: e.endDate?.slice(0, 10) ?? "",
      current: e.current, description: e.description ?? "",
    });
  }

  async function save() {
    if (!form?.title.trim() || !form.company.trim()) { toast({ title: "Title and company required", variant: "error" }); return; }
    setSaving(true);
    try {
      await api(editId ? `/api/profile/experience/${editId}` : "/api/profile/experience", {
        method: editId ? "PUT" : "POST", body: JSON.stringify(form),
      });
      toast({ title: editId ? "Experience updated" : "Experience added", variant: "success" });
      setForm(null); setEditId(null); reload();
    } catch (e) { toast({ title: "Save failed", description: (e as Error).message, variant: "error" }); }
    finally { setSaving(false); }
  }
  async function remove(id: string) { await api(`/api/profile/experience/${id}`, { method: "DELETE" }); reload(); }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Work experience</CardTitle>
        {!form && <Button size="sm" variant="outline" onClick={() => { setEditId(null); setForm({ ...emptyExp }); }}><Plus className="h-4 w-4" /> Add</Button>}
      </CardHeader>
      <CardContent className="space-y-3">
        {form && (
          <div className="rounded-lg border p-4 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <FieldI label="Title *" value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
              <FieldI label="Company *" value={form.company} onChange={(v) => setForm({ ...form, company: v })} />
              <FieldI label="Location" value={form.location} onChange={(v) => setForm({ ...form, location: v })} />
              <div />
              <FieldI label="Start date" type="date" value={form.startDate} onChange={(v) => setForm({ ...form, startDate: v })} />
              <FieldI label="End date" type="date" value={form.endDate} onChange={(v) => setForm({ ...form, endDate: v })} disabled={form.current} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.current} onChange={(e) => setForm({ ...form, current: e.target.checked })} /> I currently work here
            </label>
            <div className="space-y-1.5"><Label>Description</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={saving}>{saving && <Loader2 className="animate-spin" />} Save</Button>
              <Button size="sm" variant="ghost" onClick={() => { setForm(null); setEditId(null); }}><X className="h-4 w-4" /> Cancel</Button>
            </div>
          </div>
        )}
        {loading ? <ListSkeleton rows={2} /> : (data?.length ?? 0) === 0 && !form ? (
          <p className="text-sm text-muted-foreground text-center py-4">No experience added yet.</p>
        ) : (
          data?.map((e) => (
            <div key={e.id} className="flex items-start justify-between rounded-lg border px-3 py-2">
              <div>
                <div className="font-medium text-sm">{e.title} · {e.company} {e.current && <Badge variant="info">Current</Badge>}</div>
                <div className="text-xs text-muted-foreground">
                  {e.location ? `${e.location} · ` : ""}{e.startDate ? formatDate(e.startDate) : "?"} – {e.current ? "Present" : e.endDate ? formatDate(e.endDate) : "?"}
                </div>
                {e.description && <p className="text-xs text-muted-foreground mt-1">{e.description}</p>}
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="icon" variant="ghost" onClick={() => startEdit(e)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => remove(e.id)} aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

// ─────────── Education ───────────
interface Education { id: string; institution: string; degree: string | null; field: string | null; startDate: string | null; endDate: string | null; description: string | null; }
const emptyEdu = { institution: "", degree: "", field: "", startDate: "", endDate: "", description: "" };

export function EducationEditor() {
  const { data, loading, reload } = useFetch<Education[]>("/api/profile/education");
  const { toast } = useToast();
  const [form, setForm] = React.useState<typeof emptyEdu | null>(null);
  const [editId, setEditId] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  function startEdit(e: Education) {
    setEditId(e.id);
    setForm({ institution: e.institution, degree: e.degree ?? "", field: e.field ?? "", startDate: e.startDate?.slice(0, 10) ?? "", endDate: e.endDate?.slice(0, 10) ?? "", description: e.description ?? "" });
  }
  async function save() {
    if (!form?.institution.trim()) { toast({ title: "Institution required", variant: "error" }); return; }
    setSaving(true);
    try {
      await api(editId ? `/api/profile/education/${editId}` : "/api/profile/education", { method: editId ? "PUT" : "POST", body: JSON.stringify(form) });
      toast({ title: editId ? "Education updated" : "Education added", variant: "success" });
      setForm(null); setEditId(null); reload();
    } catch (e) { toast({ title: "Save failed", description: (e as Error).message, variant: "error" }); }
    finally { setSaving(false); }
  }
  async function remove(id: string) { await api(`/api/profile/education/${id}`, { method: "DELETE" }); reload(); }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Education</CardTitle>
        {!form && <Button size="sm" variant="outline" onClick={() => { setEditId(null); setForm({ ...emptyEdu }); }}><Plus className="h-4 w-4" /> Add</Button>}
      </CardHeader>
      <CardContent className="space-y-3">
        {form && (
          <div className="rounded-lg border p-4 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <FieldI label="Institution *" value={form.institution} onChange={(v) => setForm({ ...form, institution: v })} />
              <FieldI label="Degree" value={form.degree} onChange={(v) => setForm({ ...form, degree: v })} />
              <FieldI label="Field of study" value={form.field} onChange={(v) => setForm({ ...form, field: v })} />
              <div />
              <FieldI label="Start date" type="date" value={form.startDate} onChange={(v) => setForm({ ...form, startDate: v })} />
              <FieldI label="End date" type="date" value={form.endDate} onChange={(v) => setForm({ ...form, endDate: v })} />
            </div>
            <div className="space-y-1.5"><Label>Description</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={saving}>{saving && <Loader2 className="animate-spin" />} Save</Button>
              <Button size="sm" variant="ghost" onClick={() => { setForm(null); setEditId(null); }}><X className="h-4 w-4" /> Cancel</Button>
            </div>
          </div>
        )}
        {loading ? <ListSkeleton rows={2} /> : (data?.length ?? 0) === 0 && !form ? (
          <p className="text-sm text-muted-foreground text-center py-4">No education added yet.</p>
        ) : (
          data?.map((e) => (
            <div key={e.id} className="flex items-start justify-between rounded-lg border px-3 py-2">
              <div>
                <div className="font-medium text-sm">{e.degree ? `${e.degree}${e.field ? `, ${e.field}` : ""}` : e.field || "Studies"}</div>
                <div className="text-xs text-muted-foreground">{e.institution} · {e.startDate ? formatDate(e.startDate) : "?"} – {e.endDate ? formatDate(e.endDate) : "?"}</div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="icon" variant="ghost" onClick={() => startEdit(e)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => remove(e.id)} aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

// ─────────── Certifications ───────────
interface Cert { id: string; name: string; issuer: string | null; issueDate: string | null; credentialId: string | null; url: string | null; }
const emptyCert = { name: "", issuer: "", issueDate: "", expiryDate: "", credentialId: "", url: "" };

export function CertificationEditor() {
  const { data, loading, reload } = useFetch<Cert[]>("/api/profile/certifications");
  const { toast } = useToast();
  const [form, setForm] = React.useState<typeof emptyCert | null>(null);
  const [saving, setSaving] = React.useState(false);

  async function save() {
    if (!form?.name.trim()) { toast({ title: "Name required", variant: "error" }); return; }
    setSaving(true);
    try {
      await api("/api/profile/certifications", { method: "POST", body: JSON.stringify(form) });
      toast({ title: "Certification added", variant: "success" });
      setForm(null); reload();
    } catch (e) { toast({ title: "Save failed", description: (e as Error).message, variant: "error" }); }
    finally { setSaving(false); }
  }
  async function remove(id: string) { await api(`/api/profile/certifications/${id}`, { method: "DELETE" }); reload(); }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Certifications</CardTitle>
        {!form && <Button size="sm" variant="outline" onClick={() => setForm({ ...emptyCert })}><Plus className="h-4 w-4" /> Add</Button>}
      </CardHeader>
      <CardContent className="space-y-3">
        {form && (
          <div className="rounded-lg border p-4 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <FieldI label="Name *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
              <FieldI label="Issuer" value={form.issuer} onChange={(v) => setForm({ ...form, issuer: v })} />
              <FieldI label="Issue date" type="date" value={form.issueDate} onChange={(v) => setForm({ ...form, issueDate: v })} />
              <FieldI label="Credential ID" value={form.credentialId} onChange={(v) => setForm({ ...form, credentialId: v })} />
              <FieldI label="URL" value={form.url} onChange={(v) => setForm({ ...form, url: v })} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={saving}>{saving && <Loader2 className="animate-spin" />} Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setForm(null)}><X className="h-4 w-4" /> Cancel</Button>
            </div>
          </div>
        )}
        {loading ? <ListSkeleton rows={2} /> : (data?.length ?? 0) === 0 && !form ? (
          <p className="text-sm text-muted-foreground text-center py-4">No certifications added yet.</p>
        ) : (
          data?.map((c) => (
            <div key={c.id} className="flex items-start justify-between rounded-lg border px-3 py-2">
              <div>
                <div className="font-medium text-sm">{c.name}</div>
                <div className="text-xs text-muted-foreground">{c.issuer ?? ""}{c.issueDate ? ` · ${formatDate(c.issueDate)}` : ""}{c.credentialId ? ` · ID ${c.credentialId}` : ""}</div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => remove(c.id)} aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function FieldI({ label, value, onChange, type, disabled }: { label: string; value: string; onChange: (v: string) => void; type?: string; disabled?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
    </div>
  );
}
