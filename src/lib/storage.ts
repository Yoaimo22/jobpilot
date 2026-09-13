/**
 * Storage abstraction. In production (Supabase configured) CV files go to a
 * private Supabase Storage bucket. In local dev (no Supabase env) they fall
 * back to the private disk folder. The rest of the app calls the same
 * saveFile / readFile / deleteFile functions regardless.
 */
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";

const STORAGE_DIR = process.env.STORAGE_DIR ?? "./storage/private";
const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "cvs";

/** True when Supabase Storage is configured (production path). */
export const usingSupabase = Boolean(SUPABASE_URL && SUPABASE_SERVICE_KEY);

// ── Supabase Storage REST helpers (no SDK dependency needed) ──
function storageUrl(objectPath: string) {
  return `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${objectPath}`;
}

async function supabaseUpload(objectPath: string, buffer: Buffer, contentType: string) {
  const res = await fetch(storageUrl(objectPath), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: new Uint8Array(buffer),
  });
  if (!res.ok) throw new Error(`Supabase upload failed: ${res.status} ${await res.text()}`);
}

async function supabaseDownload(objectPath: string): Promise<Buffer> {
  const res = await fetch(storageUrl(objectPath), {
    headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function supabaseDelete(objectPath: string) {
  await fetch(storageUrl(objectPath), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
  }).catch(() => {});
}

// ── Public API (same shape as before) ──
export async function saveFile(userId: string, fileName: string, buffer: Buffer) {
  const ext = path.extname(fileName) || ".pdf";
  const stored = `${userId}/${randomUUID()}${ext}`;
  if (usingSupabase) {
    await supabaseUpload(stored, buffer, "application/pdf");
    return { relativePath: stored, fullPath: stored };
  }
  const dir = path.join(process.cwd(), STORAGE_DIR, userId);
  await fs.mkdir(dir, { recursive: true });
  const full = path.join(process.cwd(), STORAGE_DIR, stored);
  await fs.writeFile(full, buffer);
  return { relativePath: stored, fullPath: full };
}

export async function readFile(relativePath: string): Promise<Buffer> {
  if (usingSupabase) return supabaseDownload(relativePath);
  const full = path.join(process.cwd(), STORAGE_DIR, relativePath);
  return fs.readFile(full);
}

export async function deleteFile(relativePath: string) {
  if (usingSupabase) return supabaseDelete(relativePath);
  const full = path.join(process.cwd(), STORAGE_DIR, relativePath);
  await fs.unlink(full).catch(() => {});
}

export async function deleteUserDir(userId: string) {
  if (usingSupabase) {
    // Supabase has no "delete folder" in the basic API; individual files are
    // removed as resumes are deleted. Nothing to do here for the bucket.
    return;
  }
  const dir = path.join(process.cwd(), STORAGE_DIR, userId);
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
}
