import { promises as fs } from "node:fs";
import path from "node:path";

const DATA_DIR = path.resolve(process.cwd(), "data");

/**
 * Canonical data subdirectories. Each entry is a path relative to data/.
 * Structure:
 *   data/profiles/client/   — client profiles used by Client Emulator
 *   data/profiles/servers/  — RADIUS server targets (host, port, secret)
 *   data/coa/               — CoA server simulator configs
 *   data/tests/             — YAML test fixtures
 */
export const DATA_SUBDIRS = [
  "profiles/client",
  "profiles/servers",
  "coa",
  "tests",
] as const;
export type DataSubdir = (typeof DATA_SUBDIRS)[number];

const SUBDIR_SET = new Set<string>(DATA_SUBDIRS);

export class InvalidPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPathError";
  }
}

/**
 * Resolve a user-supplied relative path to an absolute path INSIDE `data/`.
 * Rejects path traversal, absolute paths, non-yaml files, and anything
 * outside the allowed subdirectories.
 */
export function safeDataPath(rel: string): string {
  if (typeof rel !== "string" || rel.length === 0) {
    throw new InvalidPathError("empty path");
  }
  if (rel.includes("\0") || rel.includes("..") || rel.startsWith("/") || rel.startsWith("\\")) {
    throw new InvalidPathError("path traversal not allowed");
  }
  if (!rel.endsWith(".yaml")) {
    throw new InvalidPathError("only .yaml files are allowed");
  }

  const lastSlash = rel.lastIndexOf("/");
  if (lastSlash < 0) {
    throw new InvalidPathError("path must be <subdir>/<name>.yaml");
  }
  const subdir = rel.slice(0, lastSlash);
  const filename = rel.slice(lastSlash + 1);

  if (!SUBDIR_SET.has(subdir)) {
    throw new InvalidPathError(`unknown subdir: ${subdir}`);
  }
  if (!/^[a-zA-Z0-9._-]+\.yaml$/.test(filename)) {
    throw new InvalidPathError("invalid filename — use [a-zA-Z0-9._-] only");
  }

  const abs = path.resolve(DATA_DIR, rel);
  if (!abs.startsWith(DATA_DIR + path.sep)) {
    throw new InvalidPathError("resolved path escapes data/");
  }
  return abs;
}

export function dataDir(): string {
  return DATA_DIR;
}

export async function ensureDataDirs(): Promise<void> {
  await Promise.all(
    DATA_SUBDIRS.map((sub) => fs.mkdir(path.join(DATA_DIR, sub), { recursive: true })),
  );
}
