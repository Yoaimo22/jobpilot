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
import {
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import {
  BarChart3, Lightbulb, RefreshCw, Loader2, ShieldCheck, ShieldAlert,
  Wand2, FileText, TrendingUp, Quote,
} from "lucide-react";

interface PerCv {
  resumeId: string; name: string; isDefault: boolean; parsedAt: string | null;
  matchCount: number; avgOverall: number | null; avgQualification: number | null;
  avgPresentation: number | null; bestOverall: number | null;
  bestJobTitle: string | null; bestJobId: string | null;
  direct: number; related: number; inferred: number;
  sectionScores: Record<string, number>; overallCvScore: number | null;
  applications: number; interviews: number; offers: number; responses: number;
}
interface Point { name: string; value: number }
interface Analytics {
  hasData: boolean;
  perCv: PerCv[];
  recommendations: {
    total: number; accepted: number; rejected: number; pending: number; blocked: number;
    byType: Point[]; acceptanceRate: number; avgImpactAccepted: number;
  };
  versions: {
    total: number; withScores: number; avgGain: number | null; bestGain: number | null;
    byTemplate: Point[]; timeline: { name: string; before: number; after: number }[];
  };
  realGaps: Point[];
  wordingOpportunities: Point[];
  presentationGap: { avgQualification: number | null; avgPresentation: number | null; gap: number | null };
  insights: string[];
}

const COLORS = ["#22c55e", "#6366f1", "#f59e0b", "#ef4444", "#06b6d4", "#a855f7"];

export default function CvAnalyticsPage() {
  const { data, loading, error, reload } = useFetch<Analytics>("/api/cv/analytics");
  const { toast } = useToast();
  const [recomputing, setRecomputing] = React.useState(false);

  async function recompute() {
    setRecomputing(true);
    try {
      const r = await api<{ resumes: number; jobs: number; computed: number }>("/api/cv/analytics", { method: "POST" });
      toast({
        title: `${r.computed} skor dihitung`,
        description: `${r.resumes} CV × ${r.jobs} lowongan.`,
        variant: "success",
      });
      reload();
    } catch (e) {
      toast({ title: "Gagal menghitung", description: (e as Error).message, variant: "error" });
    } finally { setRecomputing(false); }
  }

  if (error) return <div><PageHeader title="Performa CV" /><ErrorState message="Gagal memuat analytics." /></div>;
  if (loading || !data) return <div><PageHeader title="Performa CV" /><ListSkeleton rows={6} /></div>;

  const analysed = data.perCv.filter((p) => p.parsedAt);
  const withMatches = data.perCv.filter((p) => p.matchCount > 0);
  const compareData = withMatches.map((p) => ({
    name: p.name.length > 16 ? p.name.slice(0, 16) + "…" : p.name,
    Kualifikasi: p.avgQualification ?? 0,
    Penyajian: p.avgPresentation ?? 0,
  }));
  const evidenceData = analysed.map((p) => ({
    name: p.name.length > 16 ? p.name.slice(0, 16) + "…" : p.name,
    Tertulis: p.direct,
    Terbukti: p.related,
    Perlu_konfirmasi: p.inferred,
  }));
  const totalApps = data.perCv.reduce((s, p) => s + p.applications, 0);

  return (
    <div>
      <PageHeader
        title="Performa CV"
        description="Semua angka dihitung dari data Anda sendiri — tidak ada perkiraan."
        action={
          <Button onClick={recompute} disabled={recomputing || analysed.length === 0}>
            {recomputing ? <Loader2 className="animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Hitung ulang skor
          </Button>
        }
      />

      {analysed.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Belum ada CV yang dianalisis"
          description="Analisis minimal satu CV agar data performa mulai terkumpul."
          action={<Link href="/dashboard/cv/analysis"><Button><Wand2 className="h-4 w-4" /> Ke AI CV Analysis</Button></Link>}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <StatCard label="CV dianalisis" value={analysed.length} icon={FileText} />
            <StatCard
              label="Kualifikasi rata-rata"
              value={data.presentationGap.avgQualification != null ? `${data.presentationGap.avgQualification}%` : "—"}
              hint="kemampuan nyata"
            />
            <StatCard
              label="Penyajian rata-rata"
              value={data.presentationGap.avgPresentation != null ? `${data.presentationGap.avgPresentation}%` : "—"}
              hint="bisa dioptimasi"
            />
            <StatCard
              label="Versi CV dibuat"
              value={data.versions.total}
              hint={data.versions.avgGain != null ? `rata-rata ${data.versions.avgGain > 0 ? "+" : ""}${data.versions.avgGain} poin` : undefined}
              icon={TrendingUp}
            />
          </div>

          <Card className="mb-4">
            <CardHeader className="flex-row items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-500" />
              <CardTitle className="text-base">Insight</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5 text-sm">
                {data.insights.map((i, idx) => (
                  <li key={idx} className="flex gap-2"><span className="text-primary shrink-0">•</span>{i}</li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {withMatches.length === 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-blue-500/40 bg-blue-500/10 p-3 text-sm text-blue-700 dark:text-blue-400 mb-4">
              <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
              Grafik perbandingan skor masih kosong karena belum ada pencocokan CV ke lowongan yang tersimpan.
              Klik <strong>Hitung ulang skor</strong> di atas.
            </div>
          )}

          <div className="grid lg:grid-cols-2 gap-4 mb-4">
            {compareData.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Kualifikasi vs Penyajian per CV</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Batang kiri = kemampuan nyata. Batang kanan = seberapa jelas CV menyatakannya.
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={compareData}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="Kualifikasi" fill="#22c55e" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Penyajian" fill="#6366f1" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Komposisi bukti kompetensi</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Tertulis = disebut langsung. Terbukti = tersimpul dari pengalaman. Perlu konfirmasi = baru petunjuk.
                </p>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={evidenceData}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Tertulis" stackId="a" fill="#22c55e" />
                      <Bar dataKey="Terbukti" stackId="a" fill="#6366f1" />
                      <Bar dataKey="Perlu_konfirmasi" stackId="a" fill="#f59e0b" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {data.realGaps.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-red-500" /> Gap skill nyata
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Sering diminta lowongan, tidak ada buktinya di CV. Tidak akan ditambahkan.
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.realGaps} layout="vertical">
                        <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                        <Tooltip />
                        <Bar dataKey="value" fill="#ef4444" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {data.wordingOpportunities.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Quote className="h-4 w-4 text-amber-500" /> Peluang perbaikan kata
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Anda punya buktinya, tapi CV belum memakai istilah lowongan. Aman diperbaiki.
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.wordingOpportunities} layout="vertical">
                        <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                        <Tooltip />
                        <Bar dataKey="value" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {data.recommendations.total > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Jenis rekomendasi</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {data.recommendations.blocked} diblokir sistem karena tanpa bukti · tingkat penerimaan {data.recommendations.acceptanceRate}%
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={data.recommendations.byType} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={78} label={(e) => e.value}>
                          {data.recommendations.byType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {data.versions.timeline.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Efek optimasi per versi</CardTitle>
                  <p className="text-xs text-muted-foreground">Skor sebelum vs sesudah tiap versi CV.</p>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.versions.timeline}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                        <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                        <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="before" name="Sebelum" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="after" name="Sesudah" fill="#22c55e" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Rincian per CV</CardTitle>
              {totalApps === 0 && (
                <p className="text-xs text-muted-foreground">
                  Kolom hasil lamaran akan terisi setelah Anda menandai lamaran memakai CV tertentu.
                </p>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="p-3 font-medium">CV</th>
                      <th className="p-3 font-medium">Skor CV</th>
                      <th className="p-3 font-medium">Rata-rata cocok</th>
                      <th className="p-3 font-medium">Terbaik</th>
                      <th className="p-3 font-medium">Lamaran</th>
                      <th className="p-3 font-medium">Interview</th>
                      <th className="p-3 font-medium">Offer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.perCv.map((p) => (
                      <tr key={p.resumeId} className="border-b last:border-0 hover:bg-accent/50">
                        <td className="p-3">
                          <span className="font-medium">{p.name}</span>
                          {p.isDefault && <Badge variant="success" className="ml-2">Default</Badge>}
                          {!p.parsedAt && <Badge variant="secondary" className="ml-2">belum dianalisis</Badge>}
                        </td>
                        <td className="p-3">{p.overallCvScore != null ? `${p.overallCvScore}/100` : "—"}</td>
                        <td className="p-3">
                          {p.avgOverall != null ? (
                            <span className="flex items-center gap-2">
                              <Badge variant={p.avgOverall >= 80 ? "success" : p.avgOverall >= 65 ? "info" : "warning"}>
                                {p.avgOverall}%
                              </Badge>
                              <span className="text-xs text-muted-foreground">{p.matchCount} lowongan</span>
                            </span>
                          ) : "—"}
                        </td>
                        <td className="p-3">
                          {p.bestJobId ? (
                            <Link href={`/dashboard/jobs/${p.bestJobId}`} className="hover:underline">
                              {p.bestOverall}% — {p.bestJobTitle}
                            </Link>
                          ) : "—"}
                        </td>
                        <td className="p-3">{p.applications}</td>
                        <td className="p-3">{p.interviews}</td>
                        <td className="p-3">{p.offers}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {analysed.some((p) => Object.keys(p.sectionScores).length > 0) && (
            <Card className="mt-4">
              <CardHeader><CardTitle className="text-base">Skor bagian CV</CardTitle></CardHeader>
              <CardContent className="grid md:grid-cols-2 gap-4">
                {analysed.filter((p) => Object.keys(p.sectionScores).length > 0).map((p) => (
                  <div key={p.resumeId} className="rounded-lg border p-3">
                    <div className="text-sm font-medium mb-2">{p.name}</div>
                    <div className="space-y-1.5">
                      {Object.entries(p.sectionScores)
                        .filter(([k]) => k !== "overall")
                        .map(([sec, sc]) => (
                          <div key={sec}>
                            <div className="flex justify-between text-xs mb-0.5">
                              <span className="capitalize">{sec}</span>
                              <span className="text-muted-foreground">{sc}/100</span>
                            </div>
                            <Progress value={sc} />
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
