import { promises as fs } from "node:fs";
import path from "node:path";
import YAML from "yaml";

import { dataDir, InvalidPathError, safeDataPath } from "./fsPaths";

export type BackupScope = "all" | "profiles" | "tests";
export type ImportStrategy = "replace" | "merge";

export interface BundleFileEntry {
  content: string;
}

export interface Bundle {
  version: 1;
  createdAt: string;
  scope: BackupScope;
  files: Record<string, BundleFileEntry>;
}

export interface ImportReport {
  applied: string[];
  skipped: Array<{ path: string; reason: string }>;
  errors: Array<{ path: string; message: string }>;
}

const BUNDLE_VERSION = 1 as const;

/** Collection-file top-level key → item id lookup, used by merge. */
const COLLECTION_KEYS: Record<string, string> = {
  "profiles/clients.yaml": "clients",
  "profiles/servers.yaml": "servers",
  "profiles/coa_sender.yaml": "coa_sender",
  "profiles/coa_server.yaml": "coa_server",
};

function getBaseDir(override?: string) {
  return override ?? dataDir();
}

async function walkYamlFiles(absDir: string, relPrefix: string): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(absDir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const result: string[] = [];
  for (const e of entries) {
    const rel = relPrefix ? `${relPrefix}/${e.name}` : e.name;
    if (e.isDirectory()) {
      result.push(...(await walkYamlFiles(path.join(absDir, e.name), rel)));
    } else if (e.isFile() && e.name.endsWith(".yaml")) {
      result.push(rel);
    }
  }
  return result;
}

/**
 * Collect every user-owned YAML file under `data/` (or the chosen subtree)
 * into a bundle shape. Runtime-owned `jobs/` is never included.
 */
export async function buildBundle(
  scope: BackupScope,
  opts?: { dataDir?: string },
): Promise<Bundle> {
  const base = getBaseDir(opts?.dataDir);
  const subdirs: string[] =
    scope === "profiles" ? ["profiles"] : scope === "tests" ? ["tests"] : ["profiles", "tests"];

  const files: Record<string, BundleFileEntry> = {};
  for (const sub of subdirs) {
    const rels = await walkYamlFiles(path.join(base, sub), sub);
    for (const rel of rels) {
      const content = await fs.readFile(path.join(base, rel), "utf8");
      files[rel] = { content };
    }
  }

  return {
    version: BUNDLE_VERSION,
    createdAt: new Date().toISOString(),
    scope,
    files,
  };
}

export class BundleParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BundleParseError";
  }
}

/**
 * Parse a bundle from YAML text. Validates shape (version, files object,
 * every file key passes safeDataPath, every content is a string) without
 * touching the filesystem.
 */
export function parseBundle(yamlText: string): Bundle {
  let raw: unknown;
  try {
    raw = YAML.parse(yamlText);
  } catch (err) {
    throw new BundleParseError(`invalid YAML: ${(err as Error).message}`);
  }
  if (!raw || typeof raw !== "object") {
    throw new BundleParseError("bundle root must be an object");
  }
  const obj = raw as Record<string, unknown>;
  if (obj.version !== BUNDLE_VERSION) {
    throw new BundleParseError(`unsupported version: ${String(obj.version)}`);
  }
  if (!obj.files || typeof obj.files !== "object" || Array.isArray(obj.files)) {
    throw new BundleParseError("bundle.files must be an object");
  }
  const scope = obj.scope;
  if (scope !== "all" && scope !== "profiles" && scope !== "tests") {
    throw new BundleParseError(`invalid scope: ${String(scope)}`);
  }

  const files: Record<string, BundleFileEntry> = {};
  for (const [rel, entry] of Object.entries(obj.files as Record<string, unknown>)) {
    try {
      safeDataPath(rel);
    } catch (err) {
      if (err instanceof InvalidPathError) {
        throw new BundleParseError(`invalid path "${rel}": ${err.message}`);
      }
      throw err;
    }
    if (!entry || typeof entry !== "object") {
      throw new BundleParseError(`files["${rel}"] must be an object`);
    }
    const content = (entry as Record<string, unknown>).content;
    if (typeof content !== "string") {
      throw new BundleParseError(`files["${rel}"].content must be a string`);
    }
    files[rel] = { content };
  }

  return {
    version: BUNDLE_VERSION,
    createdAt: typeof obj.createdAt === "string" ? obj.createdAt : "",
    scope,
    files,
  };
}

/**
 * Merge incoming collection-file content into existing content. For each
 * item in the incoming array: if an item with the same `id` already exists
 * locally, the local one wins; otherwise the incoming item is appended.
 * Returns the merged YAML text.
 */
export function mergeCollection(
  existingText: string,
  incomingText: string,
  arrayKey: string,
): string {
  const existing = parseCollection(existingText, arrayKey);
  const incoming = parseCollection(incomingText, arrayKey);
  const existingIds = new Set(existing.map((item) => item.id).filter((id): id is string => typeof id === "string"));
  for (const item of incoming) {
    if (typeof item.id === "string" && existingIds.has(item.id)) continue;
    existing.push(item);
    if (typeof item.id === "string") existingIds.add(item.id);
  }
  return YAML.stringify({ [arrayKey]: existing });
}

function parseCollection(text: string, arrayKey: string): Array<Record<string, unknown>> {
  const parsed = YAML.parse(text);
  if (parsed == null) return [];
  if (typeof parsed !== "object") {
    throw new BundleParseError(`collection file is not an object (expected key "${arrayKey}")`);
  }
  const arr = (parsed as Record<string, unknown>)[arrayKey];
  if (arr == null) return [];
  if (!Array.isArray(arr)) {
    throw new BundleParseError(`collection key "${arrayKey}" is not an array`);
  }
  return arr as Array<Record<string, unknown>>;
}

async function pathExists(abs: string): Promise<boolean> {
  try {
    await fs.access(abs);
    return true;
  } catch {
    return false;
  }
}

/**
 * Apply a parsed bundle to disk under `dataDir` using the chosen strategy.
 * - replace: every bundle file overwrites the on-disk file.
 * - merge: collection files merged by id (existing wins); single-fixture
 *   files skipped if already present.
 */
export async function applyBundle(
  bundle: Bundle,
  strategy: ImportStrategy,
  opts?: { dataDir?: string },
): Promise<ImportReport> {
  const base = getBaseDir(opts?.dataDir);
  const report: ImportReport = { applied: [], skipped: [], errors: [] };

  for (const [rel, entry] of Object.entries(bundle.files)) {
    try {
      const abs = safeDataPath(rel, base);
      await fs.mkdir(path.dirname(abs), { recursive: true });

      if (strategy === "replace") {
        // refuse to save unparseable YAML so a broken bundle can't corrupt disk
        YAML.parse(entry.content);
        await fs.writeFile(abs, entry.content, "utf8");
        report.applied.push(rel);
        continue;
      }

      // merge
      const collectionKey = COLLECTION_KEYS[rel];
      if (collectionKey) {
        let existingText = "";
        if (await pathExists(abs)) {
          existingText = await fs.readFile(abs, "utf8");
        }
        const merged = mergeCollection(existingText, entry.content, collectionKey);
        await fs.writeFile(abs, merged, "utf8");
        report.applied.push(rel);
      } else {
        if (await pathExists(abs)) {
          report.skipped.push({ path: rel, reason: "already exists (merge keeps local)" });
        } else {
          YAML.parse(entry.content);
          await fs.writeFile(abs, entry.content, "utf8");
          report.applied.push(rel);
        }
      }
    } catch (err) {
      report.errors.push({ path: rel, message: (err as Error).message });
    }
  }

  return report;
}
