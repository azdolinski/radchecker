import { promises as fs } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { z } from "zod";

import {
  ClientProfileSchema,
  CoAConfigSchema,
  ServerConfigSchema,
  TestFixtureSchema,
  type ClientProfile,
  type CoAConfig,
  type EntityKind,
  type ServerConfig,
  type TestFixture,
} from "./schemas";

const DEFAULT_DATA_DIR = path.resolve(process.cwd(), "data");

function getDataDir() {
  return process.env.RADCHECKER_DATA_DIR ?? DEFAULT_DATA_DIR;
}

function entityDir(kind: EntityKind, dataDir = getDataDir()) {
  return path.join(dataDir, kind);
}

function fileForName(kind: EntityKind, name: string, dataDir?: string) {
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
    throw new Error(`Invalid entity name: ${name}`);
  }
  return path.join(entityDir(kind, dataDir), `${name}.yaml`);
}

export class YamlStoreError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "YamlStoreError";
  }
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function readRawYaml(file: string): Promise<unknown> {
  const text = await fs.readFile(file, "utf8");
  try {
    return YAML.parse(text);
  } catch (err) {
    throw new YamlStoreError(`Failed to parse YAML at ${file}`, err);
  }
}

async function writeRawYaml(file: string, value: unknown) {
  await ensureDir(path.dirname(file));
  const text = YAML.stringify(value, { indent: 2, lineWidth: 0 });
  await fs.writeFile(file, text, "utf8");
}

async function listNames(kind: EntityKind, dataDir?: string): Promise<string[]> {
  const dir = entityDir(kind, dataDir);
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith(".yaml"))
      .map((e) => e.name.slice(0, -".yaml".length))
      .sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

async function exists(kind: EntityKind, name: string, dataDir?: string) {
  try {
    await fs.access(fileForName(kind, name, dataDir));
    return true;
  } catch {
    return false;
  }
}

async function remove(kind: EntityKind, name: string, dataDir?: string) {
  try {
    await fs.unlink(fileForName(kind, name, dataDir));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
}

function parseWith<T extends z.ZodTypeAny>(schema: T, value: unknown, file: string): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new YamlStoreError(`Schema validation failed for ${file}\n${issues}`);
  }
  return result.data as z.output<T>;
}

/* ----------------------- Public API ----------------------- */

export interface StoreOptions {
  dataDir?: string;
}

export async function listServers(opts: StoreOptions = {}) {
  return listNames("profiles/servers", opts.dataDir);
}
export async function readServer(name: string, opts: StoreOptions = {}): Promise<ServerConfig> {
  const file = fileForName("profiles/servers", name, opts.dataDir);
  return parseWith(ServerConfigSchema, await readRawYaml(file), file);
}
export async function writeServer(value: ServerConfig, opts: StoreOptions = {}) {
  const parsed = ServerConfigSchema.parse(value);
  await writeRawYaml(fileForName("profiles/servers", parsed.name, opts.dataDir), parsed);
}
export async function deleteServer(name: string, opts: StoreOptions = {}) {
  await remove("profiles/servers", name, opts.dataDir);
}

export async function listProfiles(opts: StoreOptions = {}) {
  return listNames("profiles/client", opts.dataDir);
}
export async function readProfile(name: string, opts: StoreOptions = {}): Promise<ClientProfile> {
  const file = fileForName("profiles/client", name, opts.dataDir);
  return parseWith(ClientProfileSchema, await readRawYaml(file), file);
}
export async function writeProfile(value: ClientProfile, opts: StoreOptions = {}) {
  const parsed = ClientProfileSchema.parse(value);
  await writeRawYaml(fileForName("profiles/client", parsed.name, opts.dataDir), parsed);
}
export async function deleteProfile(name: string, opts: StoreOptions = {}) {
  await remove("profiles/client", name, opts.dataDir);
}

export async function listCoAConfigs(opts: StoreOptions = {}) {
  return listNames("coa", opts.dataDir);
}
export async function readCoA(name: string, opts: StoreOptions = {}): Promise<CoAConfig> {
  const file = fileForName("coa", name, opts.dataDir);
  return parseWith(CoAConfigSchema, await readRawYaml(file), file);
}
export async function writeCoA(value: CoAConfig, opts: StoreOptions = {}) {
  const parsed = CoAConfigSchema.parse(value);
  await writeRawYaml(fileForName("coa", parsed.name, opts.dataDir), parsed);
}
export async function deleteCoA(name: string, opts: StoreOptions = {}) {
  await remove("coa", name, opts.dataDir);
}

export async function listTests(opts: StoreOptions = {}) {
  return listNames("tests", opts.dataDir);
}
export async function readTest(name: string, opts: StoreOptions = {}): Promise<TestFixture> {
  const file = fileForName("tests", name, opts.dataDir);
  return parseWith(TestFixtureSchema, await readRawYaml(file), file);
}
export async function writeTest(name: string, value: TestFixture, opts: StoreOptions = {}) {
  const parsed = TestFixtureSchema.parse(value);
  await writeRawYaml(fileForName("tests", name, opts.dataDir), parsed);
}
export async function deleteTest(name: string, opts: StoreOptions = {}) {
  await remove("tests", name, opts.dataDir);
}

/** Raw YAML read — skips validation. Useful for editor preview when schema might not match. */
export async function readRawTestYaml(name: string, opts: StoreOptions = {}): Promise<string> {
  return fs.readFile(fileForName("tests", name, opts.dataDir), "utf8");
}
export async function writeRawTestYaml(name: string, yamlText: string, opts: StoreOptions = {}) {
  const file = fileForName("tests", name, opts.dataDir);
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, yamlText, "utf8");
}

export const __internal = { fileForName, entityDir, exists };
