"use client";
import * as React from "react";
import Link from "next/link";
import useFetch from "@/lib/use-fetch";
import { api } from "@/lib/client";
import { PageHeader, ListSkeleton, ErrorState, StatCard } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";
import { Radar, Play, Trash2, Loader2, Plus, ShieldCheck, Info, CheckCircle2 } from "lucide-react";

interface Source {
  id: string; kind: string; identifier: string; label: string | null;
  enabled: boolean; lastRunAt: string | null; lastCount: number; lastError: string | null;
}
interface Report {
  sourcesRun: number; fetched: number; imported: number; duplicates: number;
  filtered: number; prepared: number; highMatches: number;
  errors: { source: string; error: string }[];
  topJobs: { title: string; company: string; score: number }[];
}

const AGGREGATORS = [
  { kind: "remotive", name: "Remotive", desc: "Lowongan remote global. Memakai kata kunci dari Target Job Titles Anda." },
  { kind: "arbeitnow", name: "Arbeitnow", desc: "Papan lowongan terbuka, banyak posisi teknologi." },
];

export default function DiscoveryPage() {
  const { data: sources, loading, error, reload } = useFetch<Source[]>("/api/discovery/sources");
  const { toast } = useToast();
  const [running, setRunning] = React.useState(false);
  const [report, setReport] = React.useState<Report | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [form, setForm] = React.useState({ kind: "greenhouse", identifier: "" });

  async function addAggregator(kind: string) {
    setAdding(true);
    try {
      const res = await api<{ foundNow: number }>("/api/discovery/sources", {
        method: "POST", body: JSON.stringify({ kind, identifier: "" }),
      });
      toast({ title: `Sumber ditambahkan — ${res.foundNow} lowongan terlihat`, variant: "success" });
      reload();
    } catch (e) { toast({ title: "Gagal menambahkan", description: (e as Error).message, variant: "error" }); }
    finally { setAdding(false); }
  }

  async function addCompany() {
    if (!form.identifier.trim()) return;
    setAdding(true);
    try {
      const res = await api<{ foundNow: number }>("/api/discovery/sources", {
        method: "POST", body: JSON.stringify(form),
      });
      toast({ title: `Ditambahkan — ${res.foundNow} lowongan ditemukan`, variant: "success" });
      setForm({ ...form, identifier: "" });
      reload();
    } catch (e) { toast({ title: "Tidak ditemukan", description: (e as Error).message, variant: "error" }); }
    finally { setAdding(false); }
  }

  async function remove(id: string) {
    await api(`/api/discovery/sources?id=${id}`, { method: "DELETE" });
    reload();
  }

  async function runNow() {
    setRunning(true);
    setReport(null);
    try {
      const r = await api<Report>("/api/discovery/run", { method: "POST" });
      setReport(r);
      toast({
        title: `${r.imported} lowongan baru, ${r.prepared} lamaran disiapkan`,
        variant: "success",
      });
      reload();
    } catch (e) { toast({ title: "Pencarian gagal", description: (e as Error).message, variant: "error" }); }
    finally { setRunning(false); }
  }

  const active = sources?.filter((s) => s.enabled) ?? [];

  return (
    <div>
      <PageHeader
        title="Pencarian Otomatis"
        description="Sistem mencari lowongan, menilai kecocokan, dan menyiapkan lamaran sendiri."
        action={
          <Button onClick={runNow} disabled={running || active.length === 0}>
            {running ? <Loader2 className="animate-spin" /> : <Play className="h-4 w-4" />}
            {running ? "Mencari…" : "Jalankan sekarang"}
          </Button>
        }
      />

      <div className="flex items-start gap-2 rounded-lg border border-blue-500/40 bg-blue-500/10 p-3 text-sm text-blue-700 dark:text-blue-400 mb-4">
        <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          <strong>Batas aman:</strong> sistem hanya memakai API resmi yang mengizinkan akses otomatis.
          LinkedIn, Indeed, Jobstreet, dan Glints <strong>tidak</strong> disertakan karena aturan layanan mereka
          melarang pendaftaran otomatis — melakukannya berisiko akun Anda diblokir permanen.
          Lamaran <strong>disiapkan otomatis</strong>, tetapi pengirimannya tetap Anda yang klik.
        </div>
      </div>

      {report && (
        <Card className="mb-4 border-primary/40">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Hasil pencarian terakhir</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
              <StatCard label="Ditemukan" value={report.fetched} />
              <StatCard label="Baru masuk" value={report.imported} />
              <StatCard label="Skor 90%+" value={report.highMatches} />
              <StatCard label="Lamaran disiapkan" value={report.prepared} />
              <StatCard label="Duplikat dilewati" value={report.duplicates} />
              <StatCard label="Tersaring aturan" value={report.filtered} />
            </div>
            {report.topJobs.length > 0 && (
              <div className="space-y-1.5 mb-3">
                <div className="text-xs font-medium text-muted-foreground">Kecocokan tertinggi</div>
                {report.topJobs.map((j, i) => (
                  <div key={i} className="flex items-center justify-between text-sm rounded-lg border px-3 py-1.5">
                    <span className="truncate">{j.title} — <span className="text-muted-foreground">{j.company}</span></span>
                    <Badge variant={j.score >= 90 ? "success" : j.score >= 80 ? "info" : "warning"}>{j.score}%</Badge>
                  </div>
                ))}
              </div>
            )}
            {report.prepared > 0 && (
              <Link href="/dashboard/queue">
                <Button size="sm">Lihat {report.prepared} lamaran yang siap disetujui</Button>
              </Link>
            )}
            {report.errors.length > 0 && (
              <div className="mt-3 text-xs text-amber-600 dark:text-amber-400">
                {report.errors.map((e, i) => <div key={i}>⚠ {e.source}: {e.error}</div>)}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Sumber otomatis (tanpa setelan)</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {AGGREGATORS.map((a) => {
              const added = sources?.some((s) => s.kind === a.kind);
              return (
                <div key={a.kind} className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2">
                  <div>
                    <div className="text-sm font-medium">{a.name}</div>
                    <div className="text-xs text-muted-foreground">{a.desc}</div>
                  </div>
                  {added ? (
                    <Badge variant="success">Aktif</Badge>
                  ) : (
                    <Button size="sm" variant="outline" disabled={adding} onClick={() => addAggregator(a.kind)}>
                      <Plus className="h-4 w-4" /> Aktifkan
                    </Button>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Tambah perusahaan tertentu</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Banyak perusahaan memakai Greenhouse atau Lever untuk halaman kariernya, dan keduanya
              menyediakan data resmi. Lihat URL halaman karier perusahaan itu — nama yang muncul di
              sana yang Anda masukkan di sini.
            </p>
            <div className="grid sm:grid-cols-3 gap-2">
              <select
                className="flex h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value })}
              >
                <option value="greenhouse">Greenhouse</option>
                <option value="lever">Lever</option>
              </select>
              <Input
                className="sm:col-span-2"
                placeholder={form.kind === "greenhouse" ? "mis. dari boards.greenhouse.io/NAMA" : "mis. dari jobs.lever.co/NAMA"}
                value={form.identifier}
                onChange={(e) => setForm({ ...form, identifier: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && addCompany()}
              />
            </div>
            <Button size="sm" onClick={addCompany} disabled={adding || !form.identifier.trim()}>
              {adding && <Loader2 className="animate-spin" />} Cek & tambahkan
            </Button>
            <p className="text-xs text-muted-foreground">
              Sumber diuji dulu saat ditambahkan — kalau namanya salah, Anda langsung diberi tahu.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader><CardTitle className="text-base">Sumber aktif</CardTitle></CardHeader>
        <CardContent>
          {error ? <ErrorState message="Gagal memuat sumber." /> : loading ? <ListSkeleton rows={2} /> : (sources?.length ?? 0) === 0 ? (
            <div className="flex items-start gap-2 text-sm text-muted-foreground py-4">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              Belum ada sumber. Aktifkan Remotive atau Arbeitnow di atas — itu paling cepat, tidak perlu setelan apa pun.
            </div>
          ) : (
            <div className="space-y-2">
              {sources!.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">
                      {s.kind}{s.identifier ? ` · ${s.identifier}` : ""}
                      {!s.enabled && <Badge variant="secondary" className="ml-2">nonaktif</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {s.lastRunAt ? `Terakhir dijalankan ${formatDate(s.lastRunAt)} — ${s.lastCount} lowongan` : "Belum pernah dijalankan"}
                      {s.lastError && <span className="text-amber-600 dark:text-amber-400"> · {s.lastError}</span>}
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => remove(s.id)} aria-label="Hapus">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Radar className="h-4 w-4" /> Berjalan sendiri setiap hari</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            Pencarian dijadwalkan otomatis <strong>setiap hari pukul 08.00 WIB</strong> di server, tanpa Anda
            membuka aplikasi. Hasilnya menunggu di Notifikasi dan Application Queue.
          </p>
          <p>
            Agar jadwal ini aktif, variabel <code className="font-mono text-xs">CRON_SECRET</code> harus diisi
            di pengaturan Vercel. Tanpa itu, tombol <strong>Jalankan sekarang</strong> tetap berfungsi.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
