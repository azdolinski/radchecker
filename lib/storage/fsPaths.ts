import { promises as fs } from "node:fs";
import path from "node:path";

const DATA_DIR = path.resolve(process.cwd(), "data");

/**
 * Canonical data subdirectories holding user-authored YAML configuration.
 *   data/profiles/    — four collection files: clients.yaml, servers.yaml,
 *                       coa_sender.yaml, coa_server.yaml
 *   data/tests/       — YAML test fixtures (one file per fixture)
 *   data/dictionary/  — FreeRADIUS-format dictionaries (dictionary.local +
 *                       any shell-dropped dictionary.<name> files)
 */
export const DATA_SUBDIRS = ["profiles", "tests", "dictionary"] as const;
export type DataSubdir = (typeof DATA_SUBDIRS)[number];

/**
 * Runtime subdirectories owned by the app (not by the user). Created on
 * startup alongside DATA_SUBDIRS but excluded from safeDataPath / the YAML
 * store (their contents are JSON and JSONL, not YAML).
 *   data/jobs/       — per-job persisted meta.json + logs.jsonl
 */
export const RUNTIME_SUBDIRS = ["jobs"] as const;
export type RuntimeSubdir = (typeof RUNTIME_SUBDIRS)[number];

const RUNTIME_SET = new Set<string>(RUNTIME_SUBDIRS);

export class InvalidPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPathError";
  }
}

/**
 * Resolve a user-supplied relative path to an absolute path INSIDE `data/`.
 * Rejects path traversal, absolute paths, non-yaml files, runtime-owned
 * subtrees (jobs/), and anything whose resolved form would escape data/.
 * Allows arbitrary directory depth so the on-disk layout is editable 1:1.
 *
 * `baseDir` defaults to the project `data/` dir; tests pass a tmp dir.
 */
const DICTIONARY_FILE_RE = /^dictionary\.[A-Za-z0-9_.-]+$/;

export function safeDataPath(rel: string, baseDir: string = DATA_DIR): string {
  if (typeof rel !== "string" || rel.length === 0) {
    throw new InvalidPathError("empty path");
  }
  if (rel.includes("\0")) {
    throw new InvalidPathError("null byte not allowed");
  }
  if (rel.startsWith("/") || rel.startsWith("\\")) {
    throw new InvalidPathError("absolute paths not allowed");
  }

  const parts = rel.split("/");
  if (parts.length < 2) {
    throw new InvalidPathError("path must include at least one directory");
  }
  for (const part of parts) {
    if (part === "" || part === "." || part === "..") {
      throw new InvalidPathError("path traversal not allowed");
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(part)) {
      throw new InvalidPathError(`invalid path segment: ${part}`);
    }
  }
  if (RUNTIME_SET.has(parts[0])) {
    throw new InvalidPathError(`${parts[0]}/ is runtime-owned`);
  }

  const filename = parts[parts.length - 1];
  const isYaml = /^[a-zA-Z0-9._-]+\.yaml$/.test(filename);
  const isDictFile =
    parts.length === 2 && parts[0] === "dictionary" && DICTIONARY_FILE_RE.test(filename);
  if (!isYaml && !isDictFile) {
    throw new InvalidPathError(
      "only .yaml files or dictionary/dictionary.<name> files are allowed",
    );
  }

  const abs = path.resolve(baseDir, rel);
  if (!abs.startsWith(baseDir + path.sep)) {
    throw new InvalidPathError("resolved path escapes data/");
  }
  return abs;
}

export function dataDir(): string {
  return DATA_DIR;
}

export function jobsDir(): string {
  return path.join(DATA_DIR, "jobs");
}

export async function ensureDataDirs(): Promise<void> {
  const all = [...DATA_SUBDIRS, ...RUNTIME_SUBDIRS];
  await Promise.all(
    all.map((sub) => fs.mkdir(path.join(DATA_DIR, sub), { recursive: true })),
  );
}
