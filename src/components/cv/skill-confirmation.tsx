"use client";
import * as React from "react";
import useFetch from "@/lib/use-fetch";
import { api } from "@/lib/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ListSkeleton } from "@/components/shared";
import { useToast } from "@/components/ui/toast";
import { HelpCircle, Quote, Loader2, CheckCircle2 } from "lucide-react";

interface Question {
  skill: string;
  quote: string;
  confidence: number;
  question: string;
}

interface Verified {
  id: string;
  skill: string;
  confirmation: "YES" | "NO" | "NOT_SURE";
  updatedAt: string;
}

/**
 * Skill confirmation (spec §11).
 *
 * Asks only about competencies the CV HINTS at. A "No" is binding — the system
 * will never present that skill as owned again, and any suggestion relying on it
 * is rejected server-side.
 */
export function SkillConfirmation({
  resumeId,
  onAnswered,
}: {
  resumeId: string;
  onAnswered?: () => void;
}) {
  const { data: questions, loading, reload } = useFetch<Question[]>(
    resumeId ? `/api/cv/questions?resumeId=${resumeId}` : null
  );
  const { data: verified, reload: reloadVerified } = useFetch<Verified[]>("/api/cv/verify-skill");
  const { toast } = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [showAnswered, setShowAnswered] = React.useState(false);

  async function answer(q: Question, confirmation: "YES" | "NO" | "NOT_SURE") {
    setBusy(q.skill);
    try {
      await api("/api/cv/verify-skill", {
        method: "POST",
        body: JSON.stringify({ skill: q.skill, confirmation, askedBecause: q.quote.slice(0, 500) }),
      });
      toast({
        title:
          confirmation === "YES" ? `${q.skill} ditandai sebagai skill Anda`
          : confirmation === "NO" ? `${q.skill} tidak akan pernah ditambahkan lagi`
          : `${q.skill} ditandai belum pasti`,
        variant: "success",
      });
      reload();
      reloadVerified();
      onAnswered?.();
    } catch (e) {
      toast({ title: "Gagal menyimpan", description: (e as Error).message, variant: "error" });
    } finally { setBusy(null); }
  }

  const pending = questions ?? [];
  const answered = verified ?? [];

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Konfirmasi skill</CardTitle></CardHeader>
        <CardContent><ListSkeleton rows={2} /></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <HelpCircle className="h-4 w-4" /> Konfirmasi skill
          {pending.length > 0 && <Badge variant="warning">{pending.length} pertanyaan</Badge>}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Sistem menemukan petunjuk kemampuan ini di CV Anda, tetapi tidak disebut eksplisit.
          Jawaban Anda menentukan — dan jawaban <strong>Tidak</strong> bersifat permanen.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {pending.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            Tidak ada pertanyaan tertunda.
          </div>
        ) : (
          pending.map((q) => (
            <div key={q.skill} className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-sm font-medium">{q.skill}</span>
                <Badge variant="warning">Keyakinan {Math.round(q.confidence * 100)}%</Badge>
              </div>
              <p className="text-sm mb-2">{q.question}</p>
              <div className="flex gap-1.5 text-xs text-muted-foreground mb-3">
                <Quote className="h-3 w-3 shrink-0 mt-0.5" />
                <span className="italic">&ldquo;{q.quote.slice(0, 160)}{q.quote.length > 160 ? "…" : ""}&rdquo;</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" onClick={() => answer(q, "YES")} disabled={busy === q.skill}>
                  {busy === q.skill && <Loader2 className="animate-spin" />} Ya, saya punya
                </Button>
                <Button size="sm" variant="outline" onClick={() => answer(q, "NO")} disabled={busy === q.skill}>
                  Tidak
                </Button>
                <Button size="sm" variant="ghost" onClick={() => answer(q, "NOT_SURE")} disabled={busy === q.skill}>
                  Belum pasti
                </Button>
              </div>
            </div>
          ))
        )}

        {answered.length > 0 && (
          <div className="pt-2 border-t">
            <button
              className="text-xs text-primary hover:underline"
              onClick={() => setShowAnswered((v) => !v)}
            >
              {showAnswered ? "Sembunyikan" : "Lihat"} {answered.length} jawaban tersimpan
            </button>
            {showAnswered && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {answered.map((v) => (
                  <Badge
                    key={v.id}
                    variant={v.confirmation === "YES" ? "success" : v.confirmation === "NO" ? "danger" : "secondary"}
                  >
                    {v.skill}: {v.confirmation === "YES" ? "Ya" : v.confirmation === "NO" ? "Tidak" : "Belum pasti"}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
