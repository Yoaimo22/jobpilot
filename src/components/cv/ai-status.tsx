"use client";
import * as React from "react";
import useFetch from "@/lib/use-fetch";
import { api } from "@/lib/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ListSkeleton } from "@/components/shared";
import { Sparkles, Loader2, CheckCircle2, XCircle, ExternalLink, Cpu } from "lucide-react";

interface Status {
  active: boolean;
  count: number;
  providers: { id: string; name: string; model: string; freeRpm: number }[];
  available: {
    id: string; name: string; keyEnv: string; defaultModel: string;
    freeRpm: number; signupUrl: string; configured: boolean;
  }[];
}
interface TestResult {
  tested: boolean;
  success?: boolean;
  provider?: string | null;
  model?: string | null;
  sample?: string | null;
  errors?: { provider: string; error: string }[];
  message?: string;
}

/**
 * Shows which free-tier AI provider is active and lets the user test it.
 * Explains plainly that the app still works fully without any AI.
 */
export function AiStatusPanel() {
  const { data, loading, reload } = useFetch<Status>("/api/cv/ai-status");
  const [testing, setTesting] = React.useState(false);
  const [result, setResult] = React.useState<TestResult | null>(null);
  const [showSetup, setShowSetup] = React.useState(false);

  async function test() {
    setTesting(true);
    setResult(null);
    try {
      setResult(await api<TestResult>("/api/cv/ai-status", { method: "POST" }));
    } catch (e) {
      setResult({ tested: true, success: false, errors: [{ provider: "-", error: (e as Error).message }] });
    } finally { setTesting(false); }
  }

  if (loading || !data) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Status AI</CardTitle></CardHeader>
        <CardContent><ListSkeleton rows={1} /></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4" /> Status AI
          {data.active ? (
            <Badge variant="success">Aktif — {data.providers[0]?.name}</Badge>
          ) : (
            <Badge variant="secondary">Logika lokal saja</Badge>
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {data.active
            ? "AI hanya menambah variasi pilihan kalimat. Penilaian skor dan aturan anti-pengarangan tetap dipegang logika lokal."
            : "Semua fitur tetap berjalan penuh tanpa AI. Menambahkan AI hanya membuat pilihan kalimat lebih bervariasi."}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.active && (
          <div className="space-y-1.5">
            {data.providers.map((p, i) => (
              <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                <span className="flex items-center gap-2 min-w-0">
                  <Cpu className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="font-medium">{p.name}</span>
                  <span className="text-xs text-muted-foreground truncate">{p.model}</span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  {p.freeRpm > 0 && <span className="text-xs text-muted-foreground">{p.freeRpm} req/menit</span>}
                  <Badge variant={i === 0 ? "success" : "secondary"}>{i === 0 ? "utama" : `cadangan ${i}`}</Badge>
                </span>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Kalau penyedia utama kena limit, sistem otomatis pindah ke cadangan. Kalau semua habis, kembali ke logika lokal.
            </p>
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={test} disabled={testing}>
            {testing ? <Loader2 className="animate-spin" /> : <Sparkles className="h-4 w-4" />} Tes koneksi AI
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowSetup((v) => !v)}>
            {showSetup ? "Sembunyikan" : "Cara menambah AI gratis"}
          </Button>
        </div>

        {result && (
          <div
            className={`rounded-lg border p-3 text-sm ${
              result.success ? "border-green-500/40 bg-green-500/5" : "border-amber-500/40 bg-amber-500/5"
            }`}
          >
            {!result.tested ? (
              <p>{result.message}</p>
            ) : result.success ? (
              <>
                <div className="flex items-center gap-2 font-medium text-green-700 dark:text-green-400">
                  <CheckCircle2 className="h-4 w-4" /> Berhasil — dijawab oleh {result.provider}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Model: {result.model}</p>
                {result.sample && (
                  <p className="text-xs mt-2">
                    <span className="text-muted-foreground">Contoh hasil: </span>
                    <span className="italic">&ldquo;{result.sample}&rdquo;</span>
                  </p>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-400">
                  <XCircle className="h-4 w-4" /> Gagal — aplikasi tetap jalan dengan logika lokal
                </div>
                <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
                  {(result.errors ?? []).map((e, i) => <li key={i}>• {e.provider}: {e.error}</li>)}
                </ul>
              </>
            )}
          </div>
        )}

        {showSetup && (
          <div className="rounded-lg border p-3 space-y-3">
            <p className="text-xs text-muted-foreground">
              Pilih satu penyedia gratis di bawah, daftar (tanpa kartu kredit), lalu tempel API key-nya di
              Vercel → <strong>Settings → Environment Variables</strong> dengan nama variabel yang tertera.
              Setelah itu <strong>Redeploy</strong>. Jangan kirim key-nya lewat chat.
            </p>
            <div className="space-y-1.5">
              {data.available.map((p) => (
                <div key={p.id} className="flex items-start justify-between gap-3 rounded border px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium flex items-center gap-2">
                      {p.name}
                      {p.configured && <Badge variant="success">terpasang</Badge>}
                      {p.freeRpm > 0 && <span className="text-xs text-muted-foreground">{p.freeRpm} req/menit gratis</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Variabel: <code className="font-mono">{p.keyEnv}</code> · Model default: {p.defaultModel}
                    </div>
                  </div>
                  {p.signupUrl && (
                    <a href={p.signupUrl} target="_blank" rel="noreferrer" className="shrink-0">
                      <Button size="sm" variant="ghost"><ExternalLink className="h-4 w-4" /> Ambil key</Button>
                    </a>
                  )}
                </div>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={reload}>Muat ulang status</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
