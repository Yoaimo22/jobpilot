"use client";
import * as React from "react";
import Link from "next/link";
import useFetch from "@/lib/use-fetch";
import { PageHeader, EmptyState, ListSkeleton, ErrorState } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { scoreVariant } from "@/components/status-meta";
import { Sparkles } from "lucide-react";

interface JobRow {
  id: string; title: string; location: string | null; matchScore: number | null;
  matchReasons: { matchedSkills: string[]; missingSkills: string[] } | null;
  company: { name: string } | null; applications: { id: string }[];
}
const BANDS = [
  { label: "All", min: 0 }, { label: "90–100%", min: 90 },
  { label: "80–89%", min: 80 }, { label: "70–79%", min: 70 },
];

export default function RecommendedPage() {
  const [band, setBand] = React.useState(0);
  const { data, loading, error } = useFetch<JobRow[]>("/api/jobs");

  const filtered = React.useMemo(() => {
    const min = BANDS[band].min;
    const max = band === 2 ? 89 : band === 3 ? 79 : 100;
    return (data ?? [])
      .filter((j) => j.applications.length === 0 && j.matchScore != null && j.matchScore >= min && j.matchScore <= max)
      .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
  }, [data, band]);

  return (
    <div>
      <PageHeader title="Recommended Jobs" description="Your best-matching, not-yet-applied jobs — with the reasons." />
      <div className="flex gap-2 mb-4">
        {BANDS.map((b, i) => (
          <Button key={b.label} size="sm" variant={band === i ? "default" : "outline"} onClick={() => setBand(i)}>{b.label}</Button>
        ))}
      </div>
      {error ? <ErrorState message="Failed to load." /> : loading ? <ListSkeleton rows={5} /> : filtered.length === 0 ? (
        <EmptyState icon={Sparkles} title="No matches in this band" description="Add jobs or adjust your profile to surface stronger matches." />
      ) : (
        <div className="grid gap-2">
          {filtered.map((j) => (
            <Link key={j.id} href={`/dashboard/jobs/${j.id}`}>
              <Card className="hover:border-primary/50 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{j.title}</div>
                      <div className="text-sm text-muted-foreground truncate">{j.company?.name} · {j.location ?? "—"}</div>
                    </div>
                    <Badge variant={scoreVariant(j.matchScore)} className="text-sm shrink-0">{j.matchScore}% MATCH</Badge>
                  </div>
                  {j.matchReasons && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {j.matchReasons.matchedSkills.slice(0, 5).map((s) => <Badge key={s} variant="success">{s}</Badge>)}
                      {j.matchReasons.missingSkills.slice(0, 3).map((s) => <Badge key={s} variant="danger">missing: {s}</Badge>)}
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
