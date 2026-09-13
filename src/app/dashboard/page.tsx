import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDashboardStats } from "@/modules/analytics/service";
import { StatCard } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/feedback";
import { STATUS_META, scoreVariant } from "@/components/status-meta";
import { formatDate } from "@/lib/utils";
import {
  Briefcase, Sparkles, Send, CalendarCheck, Trophy, Bell, ArrowRight,
} from "lucide-react";

export const dynamic = "force-dynamic";
// Give the page room on a cold start / distant database instead of being
// killed at the default 10s budget.
export const maxDuration = 30;

export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user.id;
  const stats = await getDashboardStats(userId);

  const [recent, topJobs] = await Promise.all([
    prisma.application.findMany({
      where: { userId },
      include: { job: { select: { title: true } }, company: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    prisma.job.findMany({
      where: { userId, applications: { none: {} } },
      include: { company: { select: { name: true } } },
      orderBy: { matchScore: "desc" },
      take: 5,
    }),
  ]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good Morning" : hour < 18 ? "Good Afternoon" : "Good Evening";

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{greeting}</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        Here&apos;s your job search at a glance.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
        <StatCard label="Jobs Found" value={stats.jobsDiscovered} icon={Briefcase} />
        <StatCard label="High Match Jobs" value={stats.highMatchJobs} icon={Sparkles} hint="≥ 90% match" />
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Applications Today</span>
              <Send className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-semibold mt-1">
              {stats.appliedToday} <span className="text-sm text-muted-foreground font-normal">/ {stats.dailyLimit}</span>
            </div>
            <Progress value={(stats.appliedToday / stats.dailyLimit) * 100} className="mt-2" />
          </CardContent>
        </Card>
        <StatCard label="Total Applications" value={stats.totalApplications} icon={Send} />
        <StatCard label="Interviews" value={stats.interviews} icon={CalendarCheck} />
        <StatCard label="Offers" value={stats.offers} icon={Trophy} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Pending Review" value={stats.pending} />
        <StatCard label="Technical Tests" value={stats.techTests} />
        <StatCard label="Follow-ups Due" value={stats.followUpsDue} icon={Bell} />
        <StatCard label="Rejections" value={stats.rejections} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Applications</CardTitle>
            <Link href="/dashboard/applications" className="text-xs text-primary hover:underline flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No applications yet.</p>
            ) : (
              <div className="space-y-2">
                {recent.map((a) => (
                  <Link
                    key={a.id}
                    href={`/dashboard/applications/${a.id}`}
                    className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-accent transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{a.job.title}</div>
                      <div className="text-xs text-muted-foreground truncate">{a.company?.name}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {a.matchScore != null && <Badge variant={scoreVariant(a.matchScore)}>{a.matchScore}%</Badge>}
                      <Badge variant={STATUS_META[a.status]?.variant}>{STATUS_META[a.status]?.label}</Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Top Recommended Jobs</CardTitle>
            <Link href="/dashboard/recommended" className="text-xs text-primary hover:underline flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {topJobs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Add jobs to see recommendations.</p>
            ) : (
              <div className="space-y-2">
                {topJobs.map((j) => (
                  <Link
                    key={j.id}
                    href={`/dashboard/jobs/${j.id}`}
                    className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-accent transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{j.title}</div>
                      <div className="text-xs text-muted-foreground truncate">{j.company?.name}</div>
                    </div>
                    {j.matchScore != null && <Badge variant={scoreVariant(j.matchScore)}>{j.matchScore}%</Badge>}
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
