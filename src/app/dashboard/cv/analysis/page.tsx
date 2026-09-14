"use client";
import * as React from "react";
import Link from "next/link";
import useFetch from "@/lib/use-fetch";
import { api } from "@/lib/client";
import { PageHeader, StatCard, ListSkeleton, ErrorState, EmptyState } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  Sparkles, FileText, Loader2, ShieldCheck, Quote, TrendingUp,
  CheckCircle2, AlertTriangle, XCircle, ExternalLink, Wand2,
} from "lucide-react";

interface Resume { id: string; name: string; parsedAt: string | null; isDefault: boolean; }
interface EvidenceRow { id: string; skill: string; kind: string; quote: string; confidence: number; section: string | null; }
interface SectionScore { section: string; score: number; problems: string[]; readability: number | null; }
interface AnalyzeResult {
  counts: { technicalSkills: number; experiences: number; projects: number; educations: number; certifications: number };
  evidence: EvidenceRow[];
  sectionScores: SectionScore[];
}
interface RankRow {
  jobId: string; title: string; company: string; location: string | null;
  salaryMin: number | null; salaryMax: number | null; currency: string;
  overall: number; qualificationScore: number; presentationScore: number;
  matchedExact: string[]; matchedRelated: string[]; missing: string[]; explanation: string;
}

const KIND_META: Record<string, { label: string; variant: "success" | "info" | "warning" | "danger" }> = {
  DIRECT_SKILL: { label: "Tertulis di CV", variant: "success" },
  RELATED_COMPETENCY: { label: "Terbukti dari pengalaman", variant: "info" },
  INFERRED_COMPETENCY: { label: "Perlu konfirmasi Anda", variant: "warning" },
  MISSING_SKILL: { label: "Tidak ada bukti", variant: "danger" },
};

export default function CvAnalysisPage() {
  const { data: resumes, loading: loadingResumes } = useFetch<Resume[]>("/api/resumes");
  const { toast } = useToast();
  const [selected, setSelected] = React.useState<string>("");
  const [analyzing, setAnalyzing] = React.useState(false);
  const [result, setResult] = React.useState<AnalyzeResult | null>(null);
  const [ranking, setRanking] = React.useState<RankRow[] | null>(null);
  const [rankLoading, setRankLoading] = React.useState(false);

  React.useEffect(() => {
    if (!selected && resumes?.length) {
      setSelected(resumes.find((r) => r.isDefault)?.id ?? resumes[0].id);
    }
  }, [resumes, selected]);

  async function analyze() {
    if (!selected) return;
    setAnalyzing(true);
    setResult(null);
    setRanking(null);
    try {
      const r = await api<AnalyzeResult>("/api/cv/analyze", {
        method: "POST", body: JSON.stringify({ resumeId: selected }),
      });
      setResult(r);
      toast({ title: `Analisis selesai — ${r.counts.technicalSkills} kompetensi terdeteksi`, variant: "success" });
      loadRanking();
    } catch (e) {
      toast({ title: "Analisis gagal", description: (e as Error).message, variant: "error" });
    } finally { setAnalyzing(false); }
  }

  async function loadRanking() {
    if (!selected) return;
    setRankLoading(true);
    try {
      setRanking(await api<RankRow[]>(`/api/cv/match?resumeId=${selected}`));
    } catch (e) {
      toast({ title: "Gagal memuat ranking", description: (e as Error).message, variant: "error" });
    } finally { setRankLoading(false); }
  }

  const overall = result?.sectionScores.find((s) => s.section === "overall");

  return (
    <div>
      <PageHeader
        title="AI CV Analysis"
        description="Membaca CV Anda, membuktikan tiap kompetensi dengan kutipan aslinya, lalu mencocokkan ke lowongan."
      />

      <div className="flex items-start gap-2 rounded-lg border border-blue-500/40 bg-blue-500/10 p-3 text-sm text-blue-700 dark:text-blue-400 mb-4">
        <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          <strong>Aturan sistem:</strong> setiap kompetensi yang diklaim harus punya kutipan dari CV asli Anda.
          Sistem tidak akan pernah menambahkan skill, angka, pengalaman, atau sertifikasi yang tidak ada buktinya —
          gap yang nyata akan ditampilkan apa adanya.
        </div>
      </div>

      <Card className="mb-4">
        <CardHeader><CardTitle className="text-base">Pilih CV</CardTitle></CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-3 sm:items-end">
          {loadingResumes ? <ListSkeleton rows={1} /> : (resumes?.length ?? 0) === 0 ? (
            <div className="text-sm text-muted-foreground">
              Belum ada CV. <Link href="/dashboard/cv" className="text-primary hover:underline">Upload dulu di CV Manager</Link>.
            </div>
          ) : (
            <>
              <select
                className="flex h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                value={selected}
                onChange={(e) => { setSelected(e.target.value); setResult(null); setRanking(null); }}
              >
                {resumes!.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}{r.isDefault ? " (default)" : ""}{r.parsedAt ? " — sudah dianalisis" : ""}
                  </option>
                ))}
              </select>
              <a href={`/api/resumes/${selected}/file`} target="_blank" rel="noreferrer">
                <Button variant="outline"><FileText className="h-4 w-4" /> Lihat PDF</Button>
              </a>
              <Button onClick={analyze} disabled={analyzing || !selected}>
                {analyzing ? <Loader2 className="animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {analyzing ? "Menganalisis…" : "Analisis CV"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {result && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
            <StatCard label="Kompetensi" value={result.counts.technicalSkills} />
            <StatCard label="Pengalaman kerja" value={result.counts.experiences} />
            <StatCard label="Proyek" value={result.counts.projects} />
            <StatCard label="Pendidikan" value={result.counts.educations} />
            <StatCard label="Skor CV" value={overall ? `${overall.score}/100` : "—"} />
          </div>

          <div className="grid lg:grid-cols-2 gap-4 mb-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Penilaian per bagian</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {result.sectionScores.filter((s) => s.section !== "overall").map((s) => (
                  <div key={s.section}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium capitalize">{s.section}</span>
                      <span className={s.score >= 80 ? "text-green-600 dark:text-green-400" : s.score >= 60 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}>
                        {s.score}/100
                      </span>
                    </div>
                    <Progress value={s.score} />
                    {s.problems.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5">
                        {s.problems.map((p, i) => (
                          <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                            <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5 text-amber-500" />{p}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
                {overall?.readability != null && (
                  <div className="pt-2 border-t">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium">Recruiter readability</span>
                      <span>{overall.readability}/100</span>
                    </div>
                    <Progress value={overall.readability} />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Bukti kompetensi</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Setiap baris menunjukkan kutipan asli dari CV Anda yang membuktikannya.
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {result.evidence.slice(0, 40).map((e) => {
                    const meta = KIND_META[e.kind] ?? KIND_META.MISSING_SKILL;
                    return (
                      <div key={e.id} className="rounded-lg border px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">{e.skill}</span>
                          <Badge variant={meta.variant}>{meta.label}</Badge>
                        </div>
                        <div className="flex gap-1.5 mt-1">
                          <Quote className="h-3 w-3 shrink-0 mt-0.5 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground italic">
                            &ldquo;{e.quote.slice(0, 150)}{e.quote.length > 150 ? "…" : ""}&rdquo;
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Keyakinan {Math.round(e.confidence * 100)}%
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Lowongan paling cocok dengan CV ini</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Kualifikasi = kemampuan nyata Anda. Penyajian = seberapa jelas CV menyatakannya.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={loadRanking} disabled={rankLoading || !selected}>
            {rankLoading ? <Loader2 className="animate-spin" /> : <TrendingUp className="h-4 w-4" />} Hitung
          </Button>
        </CardHeader>
        <CardContent>
          {rankLoading ? <ListSkeleton rows={4} /> : !ranking ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Klik <strong>Analisis CV</strong> lalu <strong>Hitung</strong> untuk melihat peringkat lowongan.
            </p>
          ) : ranking.length === 0 ? (
            <EmptyState icon={FileText} title="Belum ada lowongan" description="Tambahkan lowongan lewat Pencarian Otomatis atau menu Jobs." />
          ) : (
            <div className="space-y-2">
              {ranking.map((r, i) => (
                <div key={r.jobId} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium flex items-center gap-2">
                        <span className="text-muted-foreground text-sm">{i + 1}.</span>
                        <Link href={`/dashboard/jobs/${r.jobId}`} className="hover:underline truncate">{r.title}</Link>
                      </div>
                      <div className="text-sm text-muted-foreground">{r.company} · {r.location ?? "—"}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {formatCurrency(r.salaryMax ?? r.salaryMin, r.currency)}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge variant={r.overall >= 85 ? "success" : r.overall >= 70 ? "info" : r.overall >= 55 ? "warning" : "danger"} className="text-sm">
                        {r.overall}%
                      </Badge>
                      <div className="text-xs text-muted-foreground mt-1">
                        Kualifikasi {r.qualificationScore}%<br />Penyajian {r.presentationScore}%
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground mt-2">{r.explanation}</p>

                  <div className="flex flex-wrap gap-1 mt-2">
                    {r.matchedExact.slice(0, 6).map((s) => (
                      <Badge key={s} variant="success" className="gap-1"><CheckCircle2 className="h-3 w-3" />{s}</Badge>
                    ))}
                    {r.matchedRelated.slice(0, 4).map((s) => (
                      <Badge key={s} variant="info">≈ {s}</Badge>
                    ))}
                    {r.missing.slice(0, 4).map((s) => (
                      <Badge key={s} variant="danger" className="gap-1"><XCircle className="h-3 w-3" />{s}</Badge>
                    ))}
                  </div>

                  <div className="flex gap-2 mt-3">
                    <Link href={`/dashboard/cv/optimize?resumeId=${selected}&jobId=${r.jobId}`}>
                      <Button size="sm"><Wand2 className="h-4 w-4" /> Optimalkan CV untuk ini</Button>
                    </Link>
                    <Link href={`/dashboard/jobs/${r.jobId}`}>
                      <Button size="sm" variant="outline"><ExternalLink className="h-4 w-4" /> Lihat lowongan</Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
