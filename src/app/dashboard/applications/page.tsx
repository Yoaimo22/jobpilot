"use client";
import * as React from "react";
import Link from "next/link";
import useFetch from "@/lib/use-fetch";
import { PageHeader, EmptyState, ListSkeleton, ErrorState } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { STATUS_META, ALL_STATUSES, scoreVariant } from "@/components/status-meta";
import { formatDate } from "@/lib/utils";
import { Send, Search, Download } from "lucide-react";

interface AppRow {
  id: string; status: string; matchScore: number | null; createdAt: string; appliedAt: string | null;
  job: { title: string; location: string | null; source: { name: string } | null } | null;
  company: { name: string } | null; resume: { name: string } | null;
}

export default function ApplicationsPage() {
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState("");
  const url = `/api/applications?${new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}) })}`;
  const { data, loading, error } = useFetch<AppRow[]>(url);

  function exportCsv() {
    const rows = data ?? [];
    const header = ["Date", "Company", "Position", "Match Score", "Source", "CV", "Status"];
    const lines = rows.map((a) => [
      formatDate(a.appliedAt ?? a.createdAt), a.company?.name ?? "", a.job?.title ?? "",
      a.matchScore ?? "", a.job?.source?.name ?? "Manual", a.resume?.name ?? "",
      STATUS_META[a.status]?.label ?? a.status,
    ].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","));
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "applications.csv";
    link.click();
  }

  return (
    <div>
      <PageHeader
        title="Applications"
        description="Every application you've tracked."
        action={<Button variant="outline" onClick={exportCsv} disabled={!data?.length}><Download className="h-4 w-4" /> Export CSV</Button>}
      />
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search company or position…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <select className="flex h-9 rounded-md border border-input bg-background px-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {ALL_STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </select>
      </div>

      {error ? <ErrorState message="Failed to load applications." /> : loading ? <ListSkeleton rows={6} /> : (data?.length ?? 0) === 0 ? (
        <EmptyState icon={Send} title="No applications yet" description="Prepare an application from a job to see it here." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-3 font-medium">Date</th>
                    <th className="p-3 font-medium">Company</th>
                    <th className="p-3 font-medium">Position</th>
                    <th className="p-3 font-medium">Score</th>
                    <th className="p-3 font-medium">Source</th>
                    <th className="p-3 font-medium">CV</th>
                    <th className="p-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.map((a) => (
                    <tr key={a.id} className="border-b last:border-0 hover:bg-accent/50">
                      <td className="p-3 whitespace-nowrap"><Link href={`/dashboard/applications/${a.id}`} className="block">{formatDate(a.appliedAt ?? a.createdAt)}</Link></td>
                      <td className="p-3">{a.company?.name ?? "—"}</td>
                      <td className="p-3 font-medium">{a.job?.title ?? "—"}</td>
                      <td className="p-3">{a.matchScore != null ? <Badge variant={scoreVariant(a.matchScore)}>{a.matchScore}%</Badge> : "—"}</td>
                      <td className="p-3 text-muted-foreground">{a.job?.source?.name ?? "Manual"}</td>
                      <td className="p-3 text-muted-foreground">{a.resume?.name ?? "—"}</td>
                      <td className="p-3"><Badge variant={STATUS_META[a.status]?.variant}>{STATUS_META[a.status]?.label}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
