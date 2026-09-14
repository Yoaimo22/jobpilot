"use client";
import * as React from "react";
import Link from "next/link";
import useFetch from "@/lib/use-fetch";
import { api } from "@/lib/client";
import { PageHeader, EmptyState, ListSkeleton, ErrorState, StatCard } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";
import { TEMPLATES } from "@/modules/cv/templates";
import { History, FileDown, Trash2, ArrowRight, Wand2, TrendingUp } from "lucide-react";

interface Version {
  id: string;
  label: string;
  parentName: string | null;
  parentId: string;
  targetJobId: string | null;
  targetJobTitle: string | null;
  targetCompany: string | null;
  template: string;
  matchBefore: number | null;
  matchAfter: number | null;
  changeCount: number;
  hasFile: boolean;
  createdAt: string;
}

export default function CvVersionsPage() {
  const { data, loading, error, reload } = useFetch<Version[]>("/api/cv/versions");
  const { toast } = useToast();
  const [deleting, setDeleting] = React.useState<string | null>(null);
  const [confirmId, setConfirmId] = React.useState<string | null>(null);

  async function remove(id: string) {
    setDeleting(id);
    try {
      await api(`/api/cv/versions?id=${id}`, { method: "DELETE" });
      toast({ title: "Versi CV dihapus", variant: "success" });
      setConfirmId(null);
      reload();
    } catch (e) {
      toast({ title: "Gagal menghapus", description: (e as Error).message, variant: "error" });
    } finally { setDeleting(null); }
  }

  const versions = data ?? [];
  const improved = versions.filter((v) => v.matchBefore != null && v.matchAfter != null && v.matchAfter > v.matchBefore);
  const avgGain = improved.length
    ? Math.round(improved.reduce((s, v) => s + (v.matchAfter! - v.matchBefore!), 0) / improved.length)
    : 0;

  return (
    <div>
      <PageHeader
        title="Riwayat Versi CV"
        description="Setiap CV hasil optimasi tersimpan di sini. CV asli Anda tidak pernah diubah."
        action={
          <Link href="/dashboard/cv/analysis">
            <Button><Wand2 className="h-4 w-4" /> Buat versi baru</Button>
          </Link>
        }
      />

      {versions.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <StatCard label="Total versi" value={versions.length} icon={History} />
          <StatCard label="Versi yang membaik" value={improved.length} icon={TrendingUp} />
          <StatCard label="Rata-rata kenaikan" value={avgGain > 0 ? `+${avgGain}%` : "—"} />
          <StatCard
            label="Total perubahan diterapkan"
            value={versions.reduce((s, v) => s + v.changeCount, 0)}
          />
        </div>
      )}

      {error ? (
        <ErrorState message="Gagal memuat riwayat versi." />
      ) : loading ? (
        <ListSkeleton rows={4} />
      ) : versions.length === 0 ? (
        <EmptyState
          icon={History}
          title="Belum ada versi CV"
          description="Optimalkan CV untuk sebuah lowongan, lalu klik Buat PDF — hasilnya akan tersimpan di sini."
          action={
            <Link href="/dashboard/cv/analysis">
              <Button><Wand2 className="h-4 w-4" /> Mulai dari AI CV Analysis</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-2">
          {versions.map((v) => {
            const gain = v.matchBefore != null && v.matchAfter != null ? v.matchAfter - v.matchBefore : null;
            const tplName = TEMPLATES.find((t) => t.id === v.template)?.name ?? v.template;

            return (
              <Card key={v.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="font-medium">{v.label}</div>
                      <div className="text-sm text-muted-foreground">
                        Dari CV: {v.parentName ?? "—"}
                        {v.targetCompany && <> · Target: {v.targetCompany}</>}
                        {v.targetJobTitle && <> — {v.targetJobTitle}</>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {formatDate(v.createdAt)} · Template {tplName} · {v.changeCount} perubahan
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {v.matchBefore != null && v.matchAfter != null ? (
                        <div className="flex items-center gap-2 text-sm">
                          <Badge variant="secondary">{v.matchBefore}%</Badge>
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          <Badge variant={gain && gain > 0 ? "success" : "info"}>{v.matchAfter}%</Badge>
                          {gain != null && gain > 0 && (
                            <span className="text-xs text-green-600 dark:text-green-400">+{gain}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">skor tidak tercatat</span>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2 mt-3 flex-wrap">
                    {v.hasFile && (
                      <a href={`/api/cv/versions/${v.id}/file`} target="_blank" rel="noreferrer">
                        <Button size="sm"><FileDown className="h-4 w-4" /> Lihat / unduh PDF</Button>
                      </a>
                    )}
                    {v.targetJobId && (
                      <>
                        <Link href={`/dashboard/jobs/${v.targetJobId}`}>
                          <Button size="sm" variant="outline">Lihat lowongan</Button>
                        </Link>
                        <Link href={`/dashboard/cv/optimize?resumeId=${v.parentId}&jobId=${v.targetJobId}`}>
                          <Button size="sm" variant="outline"><Wand2 className="h-4 w-4" /> Optimalkan lagi</Button>
                        </Link>
                      </>
                    )}
                    {confirmId === v.id ? (
                      <span className="flex items-center gap-2">
                        <Button size="sm" variant="destructive" onClick={() => remove(v.id)} disabled={deleting === v.id}>
                          Ya, hapus versi ini
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>Batal</Button>
                      </span>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setConfirmId(v.id)}>
                        <Trash2 className="h-4 w-4" /> Hapus
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
