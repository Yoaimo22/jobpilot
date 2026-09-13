"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import useFetch from "@/lib/use-fetch";
import { PageHeader, ErrorState, ListSkeleton } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { STATUS_META } from "@/components/status-meta";
import { formatDate } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

interface Detail {
  id: string; name: string; website: string | null; industry: string | null; size: string | null;
  headquarters: string | null; description: string | null; totalApplications: number;
  firstApplicationDate: string | null; latestApplicationDate: string | null;
  applications: { id: string; status: string; createdAt: string; job: { title: string; location: string | null } | null }[];
}

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error } = useFetch<Detail>(`/api/companies/${id}`);
  if (error) return <ErrorState message="Failed to load company." />;
  if (loading || !data) return <ListSkeleton rows={5} />;

  const last60 = data.applications.filter((a) => new Date(a.createdAt) > new Date(Date.now() - 60 * 86400000)).length;

  return (
    <div>
      <PageHeader title={data.name} description={[data.industry, data.headquarters, data.size].filter(Boolean).join(" · ") || "Company"} />
      {last60 >= 4 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400 mb-4">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          You have already applied to this company {last60} times during the last 60 days.
        </div>
      )}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1 h-fit">
          <CardHeader><CardTitle className="text-base">Company info</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data.website && <div><span className="text-muted-foreground">Website: </span><a href={data.website} target="_blank" rel="noreferrer" className="text-primary hover:underline">{data.website}</a></div>}
            <Row label="Industry" value={data.industry ?? "—"} />
            <Row label="Size" value={data.size ?? "—"} />
            <Row label="Headquarters" value={data.headquarters ?? "—"} />
            <Row label="Total applications" value={String(data.totalApplications)} />
            <Row label="First application" value={data.firstApplicationDate ? formatDate(data.firstApplicationDate) : "—"} />
            <Row label="Latest application" value={data.latestApplicationDate ? formatDate(data.latestApplicationDate) : "—"} />
            {data.description && <p className="text-muted-foreground pt-2">{data.description}</p>}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Positions applied</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.applications.length === 0 ? (
              <p className="text-sm text-muted-foreground">No applications yet.</p>
            ) : data.applications.map((a) => (
              <Link key={a.id} href={`/dashboard/applications/${a.id}`} className="flex items-center justify-between rounded-lg border px-3 py-2 hover:bg-accent">
                <div>
                  <div className="text-sm font-medium">{a.job?.title ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{a.job?.location ?? ""} · {formatDate(a.createdAt)}</div>
                </div>
                <Badge variant={STATUS_META[a.status]?.variant}>{STATUS_META[a.status]?.label}</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-2"><span className="text-muted-foreground">{label}</span><span className="font-medium text-right">{value}</span></div>;
}
