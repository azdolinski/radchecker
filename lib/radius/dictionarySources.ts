import { promises as fs } from "node:fs";
import path from "node:path";

import { dataDir } from "@/lib/storage/fsPaths";

/** Source of a dictionary file — drives UI classification and editability. */
export type DictionarySource = "rfc" | "vendor" | "user";

export interface DictionaryFileInfo {
  id: string;
  path: string;
  source: DictionarySource;
  isLocal: boolean;
}

const RFC_DIR = path.resolve(
  process.cwd(),
  "node_modules",
  "radius",
  "dictionaries",
);
const VENDOR_DIR = path.resolve(process.cwd(), "lib", "radius", "vendor-dictionaries");
const DICT_FILENAME_RE = /^dictionary\.([A-Za-z0-9_.-]+)$/;
const DICT_ID_RE = /^[A-Za-z0-9_.-]+$/;
/** Special ID for the single user-editable dictionary file. */
export const LOCAL_DICT_ID = "local";

function userDictDir(baseDataDir?: string): string {
  return path.join(baseDataDir ?? dataDir(), "dictionary");
}

async function scanDir(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && DICT_FILENAME_RE.test(e.name) && e.name !== "LICENSE")
      .map((e) => e.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

function idFromFilename(filename: string): string | null {
  const match = DICT_FILENAME_RE.exec(filename);
  return match ? match[1] : null;
}

export async function listBuiltin(): Promise<DictionaryFileInfo[]> {
  const [rfcNames, vendorNames] = await Promise.all([scanDir(RFC_DIR), scanDir(VENDOR_DIR)]);
  const out: DictionaryFileInfo[] = [];
  for (const name of rfcNames) {
    const id = idFromFilename(name);
    if (!id) continue;
    out.push({ id, path: path.join(RFC_DIR, name), source: "rfc", isLocal: false });
  }
  for (const name of vendorNames) {
    const id = idFromFilename(name);
    if (!id) continue;
    out.push({ id, path: path.join(VENDOR_DIR, name), source: "vendor", isLocal: false });
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

export async function listUserFiles(baseDataDir?: string): Promise<DictionaryFileInfo[]> {
  const dir = userDictDir(baseDataDir);
  const names = await scanDir(dir);
  const out: DictionaryFileInfo[] = [];
  for (const name of names) {
    const id = idFromFilename(name);
    if (!id) continue;
    out.push({
      id,
      path: path.join(dir, name),
      source: "user",
      isLocal: id === LOCAL_DICT_ID,
    });
  }
  // `local` first so it's always at the top of the custom section.
  out.sort((a, b) => (a.isLocal === b.isLocal ? a.id.localeCompare(b.id) : a.isLocal ? -1 : 1));
  return out;
}

export function isValidDictId(id: string): boolean {
  return DICT_ID_RE.test(id) && id.length > 0 && id.length <= 64;
}

export function pathForLocalDict(baseDataDir?: string): string {
  return path.join(userDictDir(baseDataDir), `dictionary.${LOCAL_DICT_ID}`);
}

export function pathForUserDict(id: string, baseDataDir?: string): string {
  if (!isValidDictId(id)) {
    throw new Error(`invalid dictionary id: ${id}`);
  }
  return path.join(userDictDir(baseDataDir), `dictionary.${id}`);
}

export { RFC_DIR, VENDOR_DIR, userDictDir };
