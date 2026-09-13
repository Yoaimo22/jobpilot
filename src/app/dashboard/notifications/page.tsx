"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useFetch from "@/lib/use-fetch";
import { api } from "@/lib/client";
import { PageHeader, EmptyState, ListSkeleton, ErrorState } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { Bell, CheckCheck } from "lucide-react";

interface Note { id: string; type: string; title: string; message: string; read: boolean; link: string | null; createdAt: string; }

export default function NotificationsPage() {
  const router = useRouter();
  const { data, loading, error, reload } = useFetch<Note[]>("/api/notifications");
  async function markAll() { await api("/api/notifications", { method: "PATCH", body: JSON.stringify({ all: true }) }); reload(); router.refresh(); }
  async function open(n: Note) {
    if (!n.read) await api("/api/notifications", { method: "PATCH", body: JSON.stringify({ id: n.id }) });
    if (n.link) router.push(n.link); else reload();
  }
  return (
    <div>
      <PageHeader title="Notifications" description="Alerts about matches, applications, limits, and follow-ups."
        action={<Button variant="outline" onClick={markAll} disabled={!data?.some((n) => !n.read)}><CheckCheck className="h-4 w-4" /> Mark all read</Button>} />
      {error ? <ErrorState message="Failed to load." /> : loading ? <ListSkeleton rows={5} /> : (data?.length ?? 0) === 0 ? (
        <EmptyState icon={Bell} title="No notifications" description="You're all caught up." />
      ) : (
        <div className="space-y-2">
          {data!.map((n) => (
            <button key={n.id} onClick={() => open(n)} className="w-full text-left">
              <Card className={n.read ? "" : "border-primary/40 bg-primary/5"}>
                <CardContent className="p-4 flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-sm flex items-center gap-2">{n.title}{!n.read && <Badge variant="info">New</Badge>}</div>
                    <div className="text-sm text-muted-foreground">{n.message}</div>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{formatDate(n.createdAt)}</span>
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
