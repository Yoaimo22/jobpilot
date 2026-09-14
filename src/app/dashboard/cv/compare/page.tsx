"use client";
import * as React from "react";
import Link from "next/link";
import useFetch from "@/lib/use-fetch";
import { api } from "@/lib/client";
import { PageHeader, ListSkeleton, ErrorState, EmptyState } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { Scale, Loader2, Trophy, Wand2, Info, FileText } from "lucide-react";

interface JobOption { id: string; title: string; company: { name: string } | null; matchScore: number | null }
interface Row { resumeId: string; name: string; overall: number; qualification: number; presentation: number }
interface CompareResult { rows: Row[]; recommendation: string }

export default function CvComparePage() {
  const { data: jobs, loading: loadingJobs } = useFetch<JobOption[]>("/api/jobs");
  const { data: resumes } = useFetch<{ id: string; name: string; parsedAt: string | null }[]>("/api/resumes");
  const { toast } = useToast();
  const [jobId, setJobId] = React.useState("");
  const [result, setResult] = React.useState<CompareResult | null>(null);
  const [running, setRunning] = React.useState(false);

  React.useEffect(() => {
    if (!jobId && jobs?.length) setJobId(jobs[0].id);
  }, [jobs, jobId]);

  const analysed = (resumes ?? []).filter((r) => r.parsedAt);
  const notAnalysed = (resumes ?? []).filter((r) => !r.parsedAt);

  async function compare() {
    if (!jobId) return;
    setRunning(true);
    setResult(null);
    try {
      const r = await api<CompareResult>("/api/cv/match", {
        method: "POST",
        body: JSON.stringify({ jobId, compare: true }),
      });
      setResult(r);
      if (!r.rows.length) {
        toast({ title: "Belum ada CV yang dianalisis", description: "Analisis minimal satu CV dulu.", variant: "error" });
      }
    } catch (e) {
      toast({ title: "Gagal membandingkan", description: (e as Error).message, variant: "error" });
    } finally { setRunning(false); }
  }

  const selectedJob = jobs?.find((j) => j.id === jobId);
  const best = result?.rows[0];

  return (
    <div>
      <PageHeader
        title="Bandingkan CV"
        description="Skor beberapa CV Anda terhadap satu lowongan, lalu pakai yang paling cocok."
      />

      {notAnalysed.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400 mb-4">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            {notAnalysed.length} CV belum dianalisis ({notAnalysed.map((r) => r.name).join(", ")}) dan tidak akan
            ikut dibandingkan.{" "}
            <Link href="/dashboard/cv/analysis" className="underline">Analisis dulu di AI CV Analysis</Link>.
          </div>
        </div>
      )}

      <Card className="mb-4">
        <CardHeader><CardTitle className="text-base">Pilih lowongan</CardTitle></CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-3 sm:items-end">
          {loadingJobs ? (
            <ListSkeleton rows={1} />
          ) : (jobs?.length ?? 0) === 0 ? (
            <div className="text-sm text-muted-foreground">
              Belum ada lowongan.{" "}
              <Link href="/dashboard/discovery" className="text-primary hover:underline">Jalankan Pencarian Otomatis</Link>{" "}
              atau tambahkan manual di menu Jobs.
            </div>
          ) : (
            <>
              <select
                className="flex h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                value={jobId}
                onChange={(e) => { setJobId(e.target.value); setResult(null); }}
              >
                {jobs!.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title} — {j.company?.name ?? "?"}{j.matchScore != null ? ` (${j.matchScore}%)` : ""}
                  </option>
                ))}
              </select>
              <Button onClick={compare} disabled={running || !jobId || analysed.length === 0}>
                {running ? <Loader2 className="animate-spin" /> : <Scale className="h-4 w-4" />}
                Bandingkan {analysed.length} CV
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {analysed.length === 0 && (
        <EmptyState
          icon={FileText}
          title="Belum ada CV yang dianalisis"
          description="Perbandingan butuh minimal satu CV yang sudah dianalisis."
          action={<Link href="/dashboard/cv/analysis"><Button>Ke AI CV Analysis</Button></Link>}
        />
      )}

      {result && result.rows.length > 0 && (
        <>
          <Card className="mb-4 border-primary/40">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" /> Rekomendasi
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{result.recommendation}</p>
              {best && selectedJob && (
                <div className="flex gap-2 mt-3 flex-wrap">
                  <Link href={`/dashboard/cv/optimize?resumeId=${best.resumeId}&jobId=${jobId}`}>
                    <Button size="sm"><Wand2 className="h-4 w-4" /> Optimalkan {best.name} untuk lowongan ini</Button>
                  </Link>
                  <Link href={`/dashboard/jobs/${jobId}`}>
                    <Button size="sm" variant="outline">Lihat lowongan</Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Hasil perbandingan</CardTitle>
              <p className="text-xs text-muted-foreground">
                Kualifikasi = kemampuan nyata Anda (tidak berubah oleh optimasi).
                Penyajian = seberapa jelas CV itu menyatakannya.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {result.rows.map((r, i) => (
                <div
                  key={r.resumeId}
                  className={`rounded-lg border p-3 ${i === 0 ? "border-green-500/40 bg-green-500/5" : ""}`}
                >
                  <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm text-muted-foreground">{i + 1}.</span>
                      <span className="font-medium truncate">{r.name}</span>
                      {i === 0 && <Badge variant="success">Terbaik</Badge>}
                    </div>
                    <Badge
                      variant={r.overall >= 85 ? "success" : r.overall >= 70 ? "info" : r.overall >= 55 ? "warning" : "danger"}
                      className="text-sm shrink-0"
                    >
                      {r.overall}%
                    </Badge>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Kualifikasi nyata</span><span className="text-muted-foreground">{r.qualification}%</span>
                      </div>
                      <Progress value={r.qualification} />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Penyajian CV</span><span className="text-muted-foreground">{r.presentation}%</span>
                      </div>
                      <Progress value={r.presentation} />
                    </div>
                  </div>

                  {r.presentation < r.qualification - 8 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                      CV ini kurang menonjolkan kemampuan yang sudah Anda miliki — bisa diperbaiki lewat optimasi kata.
                    </p>
                  )}

                  <div className="flex gap-2 mt-2">
                    <Link href={`/dashboard/cv/optimize?resumeId=${r.resumeId}&jobId=${jobId}`}>
                      <Button size="sm" variant="outline"><Wand2 className="h-4 w-4" /> Optimalkan</Button>
                    </Link>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
