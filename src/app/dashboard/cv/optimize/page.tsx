"use client";
import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/client";
import { PageHeader, StatCard, ListSkeleton, ErrorState } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import {
  Loader2, ShieldCheck, ShieldAlert, Quote, Check, X, Pencil,
  RotateCcw, FileDown, Wand2, Info,
} from "lucide-react";

interface MatchResult {
  overall: number; qualificationScore: number; presentationScore: number;
  breakdown: Record<string, number>;
  matchedExact: string[]; matchedRelated: string[]; matchedPartial: string[]; missing: string[];
  ats: { score: number; detected: string[]; missingButProven: string[]; missingActual: string[] };
  explanation: string;
}
interface GapRow { skill: string; status: string; verdict: string; reason: string; evidence?: string }
interface Option {
  label: string; text: string; type: string; reason: string;
  evidence: string[]; relatedSkills: string[]; unsupportedSkills: string[];
  confidence: number; estimatedImpact: number;
}
interface Rec {
  id: string; section: string; originalText: string; recommendedText: string;
  options: Option[] | null; recommendationType: string; reason: string;
  evidence: string[]; relatedSkills: string[]; unsupportedSkills: string[];
  confidence: number; estimatedImpact: number; status: string; userText: string | null;
}

const TYPE_META: Record<string, { label: string; variant: "success" | "info" | "warning" | "danger"; icon: typeof ShieldCheck }> = {
  SAFE_REWRITE: { label: "AMAN — HANYA PERBAIKAN KATA", variant: "success", icon: ShieldCheck },
  RELATED_SKILL: { label: "TERKAIT PENGALAMAN NYATA ANDA", variant: "info", icon: ShieldCheck },
  REQUIRES_CONFIRMATION: { label: "PERLU KONFIRMASI ANDA", variant: "warning", icon: ShieldAlert },
  NOT_ALLOWED: { label: "JANGAN DITAMBAH — GAP SKILL NYATA", variant: "danger", icon: ShieldAlert },
};

const MODES = [
  { id: "CONSERVATIVE", name: "Conservative", desc: "Hanya perbaikan tata bahasa & kata." },
  { id: "BALANCED", name: "Balanced", desc: "Perbaikan kata + kompetensi yang berbukti kuat." },
  { id: "AGGRESSIVE", name: "Aggressive ATS", desc: "Maksimalkan keyword, tetap tanpa mengarang." },
];

export default function OptimizePage() {
  const params = useSearchParams();
  const resumeId = params.get("resumeId") ?? "";
  const jobId = params.get("jobId") ?? "";
  const { toast } = useToast();

  const [match, setMatch] = React.useState<MatchResult | null>(null);
  const [gaps, setGaps] = React.useState<GapRow[]>([]);
  const [recs, setRecs] = React.useState<Rec[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [mode, setMode] = React.useState("BALANCED");
  const [generating, setGenerating] = React.useState(false);
  const [building, setBuilding] = React.useState(false);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [editText, setEditText] = React.useState("");
  const [built, setBuilt] = React.useState<{ versionId: string; matchBefore: number | null; matchAfter: number | null; changesApplied: number } | null>(null);

  const loadAll = React.useCallback(async () => {
    if (!resumeId || !jobId) { setError("Alamat halaman tidak lengkap. Buka lewat halaman AI CV Analysis."); setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const [m, r] = await Promise.all([
        api<{ match: MatchResult; gaps: GapRow[] }>("/api/cv/match", {
          method: "POST", body: JSON.stringify({ resumeId, jobId }),
        }),
        api<Rec[]>(`/api/cv/recommendations?resumeId=${resumeId}&jobId=${jobId}`),
      ]);
      setMatch(m.match); setGaps(m.gaps); setRecs(r);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [resumeId, jobId]);

  React.useEffect(() => { loadAll(); }, [loadAll]);

  async function generate() {
    setGenerating(true);
    try {
      const res = await api<{ count: number }>("/api/cv/recommendations", {
        method: "POST", body: JSON.stringify({ resumeId, jobId, mode }),
      });
      toast({ title: `${res.count} rekomendasi dibuat`, variant: "success" });
      setRecs(await api<Rec[]>(`/api/cv/recommendations?resumeId=${resumeId}&jobId=${jobId}`));
    } catch (e) { toast({ title: "Gagal", description: (e as Error).message, variant: "error" }); }
    finally { setGenerating(false); }
  }

  async function decide(rec: Rec, status: string, chosenText?: string) {
    try {
      await api("/api/cv/recommendations", {
        method: "PATCH", body: JSON.stringify({ id: rec.id, status, chosenText }),
      });
      setRecs((prev) => prev.map((r) => r.id === rec.id ? { ...r, status, userText: chosenText ?? r.userText } : r));
      setEditing(null);
    } catch (e) { toast({ title: "Gagal menyimpan pilihan", description: (e as Error).message, variant: "error" }); }
  }

  async function buildPdf() {
    setBuilding(true);
    try {
      const res = await api<{ versionId: string; matchBefore: number | null; matchAfter: number | null; changesApplied: number }>(
        "/api/cv/generate", { method: "POST", body: JSON.stringify({ resumeId, jobId, template: "ats-simple" }) }
      );
      setBuilt(res);
      toast({ title: `CV versi baru dibuat (${res.changesApplied} perubahan)`, variant: "success" });
    } catch (e) { toast({ title: "Gagal membuat PDF", description: (e as Error).message, variant: "error" }); }
    finally { setBuilding(false); }
  }

  const accepted = recs.filter((r) => r.status === "ACCEPTED" || r.status === "MODIFIED").length;
  const pending = recs.filter((r) => r.status === "PENDING").length;
  const blocked = recs.filter((r) => r.recommendationType === "NOT_ALLOWED").length;
  const projected = match ? Math.min(100, match.overall + recs.filter((r) => r.status === "ACCEPTED" || r.status === "MODIFIED").reduce((s, r) => s + r.estimatedImpact, 0)) : 0;

  if (error) return <div><PageHeader title="Optimalkan CV" /><ErrorState message={error} /></div>;
  if (loading) return <div><PageHeader title="Optimalkan CV" /><ListSkeleton rows={6} /></div>;

  return (
    <div>
      <PageHeader
        title="Recommendation Workspace"
        description="Pilih revisi yang Anda setujui. Tidak ada perubahan yang diterapkan sebelum Anda menyetujuinya."
        action={
          <Button onClick={buildPdf} disabled={building || accepted === 0}>
            {building ? <Loader2 className="animate-spin" /> : <FileDown className="h-4 w-4" />}
            Buat PDF ({accepted})
          </Button>
        }
      />

      {match && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <StatCard label="Kecocokan saat ini" value={`${match.overall}%`} />
            <StatCard label="Kualifikasi nyata" value={`${match.qualificationScore}%`} hint="tidak berubah oleh optimasi" />
            <StatCard label="Penyajian CV" value={`${match.presentationScore}%`} hint="ini yang bisa diperbaiki" />
            <StatCard label="Perkiraan setelah optimasi" value={`${projected}%`} hint={`${accepted} revisi disetujui`} />
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-blue-500/40 bg-blue-500/10 p-3 text-sm text-blue-700 dark:text-blue-400 mb-4">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <strong>Kualifikasi {match.qualificationScore}% tidak akan naik</strong> karena mengubah kata tidak menambah kemampuan.
              Yang diperbaiki adalah <strong>penyajian ({match.presentationScore}%)</strong> — agar kemampuan yang sudah Anda
              miliki terbaca jelas oleh ATS dan rekruter.
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-4 mb-4">
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle className="text-base">Rincian penilaian</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(match.breakdown).map(([k, v]) => (
                  <div key={k}>
                    <div className="flex justify-between text-xs mb-1"><span>{k}</span><span className="text-muted-foreground">{v}%</span></div>
                    <Progress value={v} />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">ATS Keyword</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Terdeteksi ({match.ats.score}%)</div>
                  <div className="flex flex-wrap gap-1">
                    {match.ats.detected.slice(0, 8).map((s) => <Badge key={s} variant="success">{s}</Badge>)}
                  </div>
                </div>
                {match.ats.missingButProven.length > 0 && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Belum tertulis, tapi Anda punya buktinya</div>
                    <div className="flex flex-wrap gap-1">
                      {match.ats.missingButProven.map((s) => <Badge key={s} variant="info">{s}</Badge>)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Aman ditambahkan lewat perbaikan kalimat.</p>
                  </div>
                )}
                {match.ats.missingActual.length > 0 && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Gap skill nyata</div>
                    <div className="flex flex-wrap gap-1">
                      {match.ats.missingActual.map((s) => <Badge key={s} variant="danger">{s}</Badge>)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Tidak akan ditambahkan ke CV Anda.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="mb-4">
            <CardHeader><CardTitle className="text-base">Gap Analysis</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {gaps.map((g) => (
                  <div key={g.skill} className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{g.skill}</div>
                      <div className="text-xs text-muted-foreground">{g.reason}</div>
                      {g.evidence && (
                        <div className="text-xs text-muted-foreground italic mt-0.5 flex gap-1">
                          <Quote className="h-3 w-3 shrink-0 mt-0.5" />&ldquo;{g.evidence.slice(0, 110)}&rdquo;
                        </div>
                      )}
                    </div>
                    <Badge
                      variant={g.verdict === "REQUIRES_ACTUAL_SKILL" ? "danger" : g.verdict === "CAN_BE_IMPROVED_BY_WORDING" ? "warning" : "success"}
                      className="shrink-0"
                    >
                      {g.verdict === "REQUIRES_ACTUAL_SKILL" ? "Butuh skill nyata"
                        : g.verdict === "CAN_BE_IMPROVED_BY_WORDING" ? "Bisa diperbaiki kata"
                        : "Sudah jelas"}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <Card className="mb-4">
        <CardHeader className="flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base">Mode rekomendasi</CardTitle>
          <div className="flex gap-2 items-center">
            <select className="flex h-9 rounded-md border border-input bg-background px-2 text-sm" value={mode} onChange={(e) => setMode(e.target.value)}>
              {MODES.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <Button size="sm" onClick={generate} disabled={generating}>
              {generating ? <Loader2 className="animate-spin" /> : <Wand2 className="h-4 w-4" />} Buat rekomendasi
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">{MODES.find((m) => m.id === mode)?.desc}</p>
          {recs.length > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              {recs.length} rekomendasi · {accepted} disetujui · {pending} menunggu
              {blocked > 0 && <> · <span className="text-red-600 dark:text-red-400">{blocked} diblokir sistem</span></>}
            </p>
          )}
        </CardContent>
      </Card>

      {built && (
        <Card className="mb-4 border-green-500/50">
          <CardHeader><CardTitle className="text-base">CV versi baru siap</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-4 text-sm">
              <div>Sebelum: <strong>{built.matchBefore ?? "—"}%</strong></div>
              <div>Sesudah: <strong className="text-green-600 dark:text-green-400">{built.matchAfter ?? "—"}%</strong></div>
              <div>{built.changesApplied} perubahan diterapkan</div>
            </div>
            <p className="text-xs text-muted-foreground">CV asli Anda tidak diubah — ini disimpan sebagai versi baru.</p>
            <div className="flex gap-2">
              <a href={`/api/cv/versions/${built.versionId}/file`} target="_blank" rel="noreferrer">
                <Button size="sm"><FileDown className="h-4 w-4" /> Unduh / lihat PDF</Button>
              </a>
              <Link href="/dashboard/cv"><Button size="sm" variant="outline">Ke CV Manager</Button></Link>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Rekomendasi perbaikan</CardTitle></CardHeader>
        <CardContent>
          {recs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Belum ada rekomendasi. Pilih mode di atas lalu klik <strong>Buat rekomendasi</strong>.
            </p>
          ) : (
            <div className="space-y-4">
              {recs.map((rec) => {
                const meta = TYPE_META[rec.recommendationType] ?? TYPE_META.SAFE_REWRITE;
                const Icon = meta.icon;
                const options = Array.isArray(rec.options) ? rec.options : [];
                const decided = rec.status !== "PENDING";
                const chosen = rec.userText ?? (decided ? rec.recommendedText : null);

                return (
                  <div key={rec.id} className={`rounded-lg border p-4 ${rec.status === "ACCEPTED" || rec.status === "MODIFIED" ? "border-green-500/40 bg-green-500/5" : rec.status === "REJECTED" ? "opacity-60" : ""}`}>
                    <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                      <span className="text-xs font-mono text-muted-foreground">{rec.section}</span>
                      <Badge variant={meta.variant} className="gap-1"><Icon className="h-3 w-3" />{meta.label}</Badge>
                    </div>

                    <div className="mb-2">
                      <div className="text-xs text-muted-foreground mb-1">Kalimat asli</div>
                      <div className="text-sm rounded bg-muted px-3 py-2">{rec.originalText}</div>
                    </div>

                    <p className="text-xs text-muted-foreground mb-3">{rec.reason}</p>

                    {rec.evidence.length > 0 && (
                      <div className="mb-3 text-xs text-muted-foreground">
                        <span className="font-medium">Bukti dari CV Anda: </span>
                        {rec.evidence.slice(0, 2).map((e, i) => <span key={i} className="italic">&ldquo;{e.slice(0, 90)}&rdquo; </span>)}
                      </div>
                    )}

                    {rec.recommendationType === "NOT_ALLOWED" ? (
                      <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                        Diblokir sistem: klaim {rec.unsupportedSkills.join(", ") || "ini"} tidak ada buktinya di CV Anda.
                        Rekomendasi ini tidak dapat diterapkan.
                      </div>
                    ) : decided ? (
                      <div className="space-y-2">
                        <div className="text-xs text-muted-foreground">Pilihan Anda</div>
                        <div className="text-sm rounded border border-green-500/40 bg-green-500/5 px-3 py-2">{chosen}</div>
                        <Button size="sm" variant="ghost" onClick={() => decide(rec, "PENDING")}>
                          <RotateCcw className="h-4 w-4" /> Ubah lagi
                        </Button>
                      </div>
                    ) : editing === rec.id ? (
                      <div className="space-y-2">
                        <Textarea rows={3} value={editText} onChange={(e) => setEditText(e.target.value)} />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => decide(rec, "MODIFIED", editText)}>Simpan versi saya</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Batal</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {options.map((o, i) => (
                          <div key={i} className="rounded border px-3 py-2">
                            <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                              <span className="text-xs font-medium">{String.fromCharCode(65 + i)} — {o.label}</span>
                              <div className="flex items-center gap-2">
                                {o.estimatedImpact > 0 && <span className="text-xs text-green-600 dark:text-green-400">+{o.estimatedImpact}% ATS</span>}
                                <Badge variant={TYPE_META[o.type]?.variant ?? "secondary"}>{TYPE_META[o.type]?.label ?? o.type}</Badge>
                              </div>
                            </div>
                            <div className="text-sm">{o.text}</div>
                            <Button size="sm" className="mt-2" onClick={() => decide(rec, "ACCEPTED", o.text)}>
                              <Check className="h-4 w-4" /> Pilih ini
                            </Button>
                          </div>
                        ))}
                        <div className="flex gap-2 pt-1">
                          <Button size="sm" variant="outline" onClick={() => decide(rec, "REJECTED")}>
                            <X className="h-4 w-4" /> Pakai yang asli
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setEditing(rec.id); setEditText(rec.recommendedText); }}>
                            <Pencil className="h-4 w-4" /> Tulis sendiri
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
