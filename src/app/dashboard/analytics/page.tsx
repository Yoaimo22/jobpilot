"use client";
import useFetch from "@/lib/use-fetch";
import { PageHeader, StatCard, ListSkeleton, ErrorState } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { Lightbulb } from "lucide-react";

interface Point { name: string; value: number; }
interface Analytics {
  total: number; applied: number; interviews: number; offers: number;
  perDay: Point[]; byPlatform: Point[]; byCompany: Point[]; byPosition: Point[];
  byLocation: Point[]; byIndustry: Point[]; byStatus: Point[]; scoreBuckets: Point[];
  interviewConversion: number; offerConversion: number; responseRate: number; insights: string[];
}

const COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4", "#a855f7", "#ec4899"];

export default function AnalyticsPage() {
  const { data, loading, error } = useFetch<Analytics>("/api/analytics");
  if (error) return <ErrorState message="Failed to load analytics." />;
  if (loading || !data) return <ListSkeleton rows={6} />;

  return (
    <div>
      <PageHeader title="Analytics" description="All figures are computed from your real data." />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Applications" value={data.applied} hint={`${data.total} tracked`} />
        <StatCard label="Interview Conversion" value={`${data.interviewConversion}%`} hint={`${data.interviews} interviews`} />
        <StatCard label="Offer Conversion" value={`${data.offerConversion}%`} hint={`${data.offers} offers`} />
        <StatCard label="Response Rate" value={`${data.responseRate}%`} />
      </div>

      <Card className="mb-4">
        <CardHeader className="flex-row items-center gap-2"><Lightbulb className="h-4 w-4 text-amber-500" /><CardTitle className="text-base">Insights</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-1.5 text-sm">
            {data.insights.map((i, idx) => <li key={idx} className="flex gap-2"><span className="text-primary">•</span>{i}</li>)}
          </ul>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <ChartCard title="Applications per Day (30d)">
          <LineChart data={data.perDay}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={4} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip />
            <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} dot={false} />
          </LineChart>
        </ChartCard>
        <ChartCard title="Applications by Platform">
          <BarChart data={data.byPlatform}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} allowDecimals={false} /><Tooltip />
            <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartCard>
        <ChartCard title="Match Score Distribution">
          <BarChart data={data.scoreBuckets}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} allowDecimals={false} /><Tooltip />
            <Bar dataKey="value" fill="#22c55e" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartCard>
        <ChartCard title="Application Status Distribution">
          <PieChart>
            <Pie data={data.byStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={(e) => e.name}>
              {data.byStatus.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ChartCard>
        <ChartCard title="Applications by Company">
          <BarChart data={data.byCompany} layout="vertical">
            <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} /><YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} /><Tooltip />
            <Bar dataKey="value" fill="#a855f7" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ChartCard>
        <ChartCard title="Applications by Position">
          <BarChart data={data.byPosition} layout="vertical">
            <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} /><YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} /><Tooltip />
            <Bar dataKey="value" fill="#06b6d4" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactElement }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent><div className="h-64"><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div></CardContent>
    </Card>
  );
}
