"use client";
import * as React from "react";
import Link from "next/link";
import useFetch from "@/lib/use-fetch";
import { api } from "@/lib/client";
import { PageHeader, EmptyState, ListSkeleton, ErrorState } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TagInput } from "@/components/tag-input";
import { useToast } from "@/components/ui/toast";
import { FileText, Loader2, Star, Trash2, Eye, Upload, Sparkles } from "lucide-react";

interface Resume {
  id: string; name: string; fileName: string; fileSize: number; isDefault: boolean;
  extractedSkills: string[]; extractedFrameworks: string[]; extractedLanguages: string[];
  extractedTools: string[]; extractedCertifications: string[];
}

export default function CvPage() {
  const { data, loading, error, reload } = useFetch<Resume[]>("/api/resumes");
  const { toast } = useToast();
  const [file, setFile] = React.useState<File | null>(null);
  const [name, setName] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const [editing, setEditing] = React.useState<string | null>(null);

  async function upload() {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", name || file.name.replace(/\.pdf$/i, ""));
      const res = await fetch("/api/resumes", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast({ title: "CV uploaded & parsed", variant: "success" });
      setFile(null); setName(""); reload();
    } catch (e) { toast({ title: "Upload failed", description: (e as Error).message, variant: "error" }); }
    finally { setUploading(false); }
  }

  async function setDefault(id: string) { await api(`/api/resumes/${id}`, { method: "PATCH", body: JSON.stringify({ isDefault: true }) }); reload(); }
  async function remove(id: string) { await api(`/api/resumes/${id}`, { method: "DELETE" }); reload(); }

  return (
    <div>
      <PageHeader
        title="CV Manager"
        description="Upload multiple CVs. We extract skills for matching — you can correct them."
        action={
          <Link href="/dashboard/cv/analysis">
            <Button><Sparkles className="h-4 w-4" /> AI CV Analysis</Button>
          </Link>
        }
      />
      <Card className="mb-4">
        <CardHeader><CardTitle className="text-base">Upload a CV (PDF)</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-3 gap-3 items-end">
          <div className="space-y-1.5 sm:col-span-1"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Backend Engineer CV" /></div>
          <div className="space-y-1.5 sm:col-span-1"><Label>File</Label><Input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
          <Button onClick={upload} disabled={!file || uploading}>{uploading ? <Loader2 className="animate-spin" /> : <Upload className="h-4 w-4" />} Upload</Button>
        </CardContent>
      </Card>

      {error ? <ErrorState message="Failed to load CVs." /> : loading ? <ListSkeleton rows={3} /> : (data?.length ?? 0) === 0 ? (
        <EmptyState icon={FileText} title="No CVs yet" description="Upload your first CV to enable smart CV selection." />
      ) : (
        <div className="grid gap-3">
          {data!.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium truncate">{r.name}</span>
                    {r.isDefault && <Badge variant="success">Default</Badge>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <a href={`/api/resumes/${r.id}/file`} target="_blank" rel="noreferrer"><Button size="icon" variant="ghost" aria-label="Preview"><Eye className="h-4 w-4" /></Button></a>
                    {!r.isDefault && <Button size="icon" variant="ghost" onClick={() => setDefault(r.id)} aria-label="Set default"><Star className="h-4 w-4" /></Button>}
                    <Button size="icon" variant="ghost" onClick={() => remove(r.id)} aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
                {editing === r.id ? (
                  <EditExtracted resume={r} onDone={() => { setEditing(null); reload(); }} />
                ) : (
                  <div className="space-y-2">
                    <SkillLine label="Skills" items={r.extractedSkills} />
                    <SkillLine label="Languages" items={r.extractedLanguages} />
                    <SkillLine label="Frameworks" items={r.extractedFrameworks} />
                    <SkillLine label="Tools" items={r.extractedTools} />
                    <Button size="sm" variant="outline" onClick={() => setEditing(r.id)}>Correct extraction</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function SkillLine({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-muted-foreground w-24 shrink-0">{label}</span>
      <div className="flex flex-wrap gap-1">{items.length ? items.map((s) => <Badge key={s} variant="secondary">{s}</Badge>) : <span className="text-xs text-muted-foreground">None detected</span>}</div>
    </div>
  );
}

function EditExtracted({ resume, onDone }: { resume: Resume; onDone: () => void }) {
  const [skills, setSkills] = React.useState(resume.extractedSkills);
  const [langs, setLangs] = React.useState(resume.extractedLanguages);
  const [fw, setFw] = React.useState(resume.extractedFrameworks);
  const [tools, setTools] = React.useState(resume.extractedTools);
  const [saving, setSaving] = React.useState(false);
  async function save() {
    setSaving(true);
    await api(`/api/resumes/${resume.id}`, { method: "PATCH", body: JSON.stringify({ extractedSkills: skills, extractedLanguages: langs, extractedFrameworks: fw, extractedTools: tools }) });
    setSaving(false); onDone();
  }
  return (
    <div className="space-y-3">
      <div><Label className="text-xs">Skills</Label><TagInput value={skills} onChange={setSkills} /></div>
      <div><Label className="text-xs">Languages</Label><TagInput value={langs} onChange={setLangs} /></div>
      <div><Label className="text-xs">Frameworks</Label><TagInput value={fw} onChange={setFw} /></div>
      <div><Label className="text-xs">Tools</Label><TagInput value={tools} onChange={setTools} /></div>
      <div className="flex gap-2"><Button size="sm" onClick={save} disabled={saving}>{saving && <Loader2 className="animate-spin" />} Save</Button><Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button></div>
    </div>
  );
}
