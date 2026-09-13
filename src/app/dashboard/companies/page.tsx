"use client";
import Link from "next/link";
import useFetch from "@/lib/use-fetch";
import { PageHeader, EmptyState, ListSkeleton, ErrorState } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { STATUS_META } from "@/components/status-meta";
import { formatDate } from "@/lib/utils";
import { Building2 } from "lucide-react";

interface Row {
  id: string; name: string; industry: string | null; applicationCount: number;
  latestPosition: string | null; latestStatus: string | null; latestDate: string | null;
}

export default function CompaniesPage() {
  const { data, loading, error } = useFetch<Row[]>("/api/companies");
  return (
    <div>
      <PageHeader title="Companies" description="Where you've applied, and how often." />
      {error ? <ErrorState message="Failed to load." /> : loading ? <ListSkeleton rows={5} /> : (data?.length ?? 0) === 0 ? (
        <EmptyState icon={Building2} title="No companies yet" description="Add a job — its company appears here automatically." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-3 font-medium">Company</th>
                    <th className="p-3 font-medium">Applications</th>
                    <th className="p-3 font-medium">Latest Application</th>
                    <th className="p-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.map((c) => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-accent/50">
                      <td className="p-3"><Link href={`/dashboard/companies/${c.id}`} className="font-medium hover:underline">{c.name}</Link>
                        {c.industry && <div className="text-xs text-muted-foreground">{c.industry}</div>}
                      </td>
                      <td className="p-3">
                        {c.applicationCount}
                        {c.applicationCount >= 4 && <Badge variant="warning" className="ml-2">frequent</Badge>}
                      </td>
                      <td className="p-3">{c.latestPosition ?? "—"}<div className="text-xs text-muted-foreground">{c.latestDate ? formatDate(c.latestDate) : ""}</div></td>
                      <td className="p-3">{c.latestStatus ? <Badge variant={STATUS_META[c.latestStatus]?.variant}>{STATUS_META[c.latestStatus]?.label}</Badge> : "—"}</td>
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
