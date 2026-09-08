import { db, type AssetMeta } from "./db";

const ASSETS_DIR = "assets";

export const opfsSupported =
  typeof navigator !== "undefined" &&
  "storage" in navigator &&
  typeof (navigator.storage as { getDirectory?: unknown }).getDirectory === "function";

async function assetsDir(create = true): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(ASSETS_DIR, { create });
}

function classify(mime: string): AssetMeta["kind"] {
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/")) return "image";
  return "other";
}

export function newId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

export async function listAssets(): Promise<AssetMeta[]> {
  const d = await db();
  const all = (await d.getAll("assets")) as AssetMeta[];
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

/** Persist a File into OPFS + metadata into IndexedDB. */
export async function saveAsset(file: File, meta?: Partial<AssetMeta>): Promise<AssetMeta> {
  const id = meta?.id ?? newId();
  const dir = await assetsDir();
  const fh = await dir.getFileHandle(id, { create: true });
  const w = await fh.createWritable();
  await w.write(file);
  await w.close();
  const record: AssetMeta = {
    id,
    filename: file.name,
    size: file.size,
    mime: file.type || "application/octet-stream",
    kind: classify(file.type),
    createdAt: Date.now(),
    ...meta,
  };
  const d = await db();
  await d.put("assets", record);
  return record;
}

export async function updateAssetMeta(meta: AssetMeta): Promise<void> {
  const d = await db();
  await d.put("assets", meta);
}

export async function readAssetBytes(id: string): Promise<Uint8Array> {
  const dir = await assetsDir(false);
  const fh = await dir.getFileHandle(id);
  const file = await fh.getFile();
  return new Uint8Array(await file.arrayBuffer());
}

export async function readAssetFile(id: string): Promise<File> {
  const dir = await assetsDir(false);
  const fh = await dir.getFileHandle(id);
  return fh.getFile();
}

export async function deleteAsset(id: string): Promise<void> {
  const d = await db();
  await d.delete("assets", id);
  try {
    const dir = await assetsDir(false);
    await dir.removeEntry(id);
  } catch {
    /* file may already be gone */
  }
}

export interface QuotaInfo {
  used: number;
  quota?: number;
}

export async function estimateQuota(): Promise<QuotaInfo> {
  try {
    const est = await navigator.storage.estimate();
    return { used: est.usage ?? 0, quota: est.quota };
  } catch {
    return { used: 0 };
  }
}
