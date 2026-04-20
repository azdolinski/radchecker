import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import YAML from "yaml";
import { z } from "zod";

import {
  ClientsFileSchema,
  ServersFileSchema,
  CoASenderFileSchema,
  CoAServerFileSchema,
  DictionaryConfigFileSchema,
  TestFixtureSchema,
  type ClientProfile,
  type CoAConfig,
  type CoAPacketProfile,
  type DictionaryConfig,
  type ServerConfig,
  type TestFixture,
} from "./schemas";

const DEFAULT_DATA_DIR = path.resolve(process.cwd(), "data");

function getDataDir(override?: string) {
  return override ?? process.env.RADCHECKER_DATA_DIR ?? DEFAULT_DATA_DIR;
}

const CLIENTS_FILE = "profiles/clients.yaml";
const SERVERS_FILE = "profiles/servers.yaml";
const COA_SENDER_FILE = "profiles/coa_sender.yaml";
const COA_SERVER_FILE = "profiles/coa_server.yaml";
const DICTIONARY_CONFIG_FILE = "profiles/dictionary.yaml";
const DICTIONARY_DIR = "dictionary";
const LOCAL_DICT_ID = "local";
const TESTS_DIR = "tests";

function assertSafeName(name: string) {
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
    throw new Error(`Invalid entity name: ${name}`);
  }
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

async function readFileIfExists(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
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

async function readCollection<T>(
  file: string,
  schema: z.ZodType<{ [k: string]: T[] }>,
  key: string,
  dataDir: string,
): Promise<T[]> {
  const abs = path.join(dataDir, file);
  const text = await readFileIfExists(abs);
  if (text === null) return [];
  let parsed: unknown;
  try {
    parsed = YAML.parse(text);
  } catch (err) {
    throw new YamlStoreError(`Failed to parse YAML at ${abs}`, err);
  }
  // Treat an empty file (null after YAML.parse) as an empty collection.
  const input = parsed ?? { [key]: [] };
  const validated = parseWith(schema, input, abs);
  return validated[key] ?? [];
}

async function writeCollection<T>(
  file: string,
  key: string,
  list: T[],
  dataDir: string,
): Promise<void> {
  const abs = path.join(dataDir, file);
  await ensureDir(path.dirname(abs));
  const text = YAML.stringify({ [key]: list }, { indent: 2, lineWidth: 0 });
  await fs.writeFile(abs, text, "utf8");
}

/* ----------------------- Public API ----------------------- */

export interface StoreOptions {
  dataDir?: string;
}

/**
 * Defensive UUID injection. Any caller passing a profile without `id` gets
 * one generated, so hand-rolled POSTs and tests don't have to remember.
 */
function withId<T extends { id?: string }>(value: T): T & { id: string } {
  if (typeof value.id === "string" && value.id.length > 0) return value as T & { id: string };
  return { ...value, id: randomUUID() };
}

/**
 * Upsert by id (falling back to name). Preserves the order of the original
 * list; new entries are appended. Returns the mutated list.
 */
function upsertByIdOrName<T extends { id: string; name: string }>(list: T[], value: T): T[] {
  const next = [...list];
  const idxById = next.findIndex((e) => e.id === value.id);
  if (idxById >= 0) {
    next[idxById] = value;
    return next;
  }
  const idxByName = next.findIndex((e) => e.name === value.name);
  if (idxByName >= 0) {
    next[idxByName] = value;
    return next;
  }
  next.push(value);
  return next;
}

/* ---------- Client profiles (data/profiles/clients.yaml) ---------- */

export async function readAllProfiles(opts: StoreOptions = {}): Promise<ClientProfile[]> {
  return readCollection<ClientProfile>(
    CLIENTS_FILE,
    ClientsFileSchema as unknown as z.ZodType<{ [k: string]: ClientProfile[] }>,
    "clients",
    getDataDir(opts.dataDir),
  );
}
export async function listProfiles(opts: StoreOptions = {}): Promise<string[]> {
  return (await readAllProfiles(opts)).map((p) => p.name).sort();
}
export async function readProfile(name: string, opts: StoreOptions = {}): Promise<ClientProfile> {
  assertSafeName(name);
  const all = await readAllProfiles(opts);
  const found = all.find((p) => p.name === name);
  if (!found) throw new YamlStoreError(`client profile not found: ${name}`);
  return found;
}
export async function readProfileById(
  id: string,
  opts: StoreOptions = {},
): Promise<ClientProfile | null> {
  const all = await readAllProfiles(opts);
  return all.find((p) => p.id === id) ?? null;
}
export async function writeProfile(value: ClientProfile, opts: StoreOptions = {}) {
  const withUuid = withId(value);
  assertSafeName(withUuid.name);
  const all = await readAllProfiles(opts);
  const next = upsertByIdOrName(all, withUuid);
  const validated = parseWith(
    ClientsFileSchema,
    { clients: next },
    path.join(getDataDir(opts.dataDir), CLIENTS_FILE),
  );
  await writeCollection(CLIENTS_FILE, "clients", validated.clients, getDataDir(opts.dataDir));
}
export async function deleteProfile(name: string, opts: StoreOptions = {}) {
  assertSafeName(name);
  const all = await readAllProfiles(opts);
  const next = all.filter((p) => p.name !== name);
  if (next.length === all.length) return;
  await writeCollection(CLIENTS_FILE, "clients", next, getDataDir(opts.dataDir));
}

/* ---------- Server configs (data/profiles/servers.yaml) ---------- */

export async function readAllServers(opts: StoreOptions = {}): Promise<ServerConfig[]> {
  return readCollection<ServerConfig>(
    SERVERS_FILE,
    ServersFileSchema as unknown as z.ZodType<{ [k: string]: ServerConfig[] }>,
    "servers",
    getDataDir(opts.dataDir),
  );
}
export async function listServers(opts: StoreOptions = {}): Promise<string[]> {
  return (await readAllServers(opts)).map((s) => s.name).sort();
}
export async function readServer(name: string, opts: StoreOptions = {}): Promise<ServerConfig> {
  assertSafeName(name);
  const all = await readAllServers(opts);
  const found = all.find((s) => s.name === name);
  if (!found) throw new YamlStoreError(`server config not found: ${name}`);
  return found;
}
export async function readServerById(
  id: string,
  opts: StoreOptions = {},
): Promise<ServerConfig | null> {
  const all = await readAllServers(opts);
  return all.find((s) => s.id === id) ?? null;
}
export async function writeServer(value: ServerConfig, opts: StoreOptions = {}) {
  const withUuid = withId(value);
  assertSafeName(withUuid.name);
  const all = await readAllServers(opts);
  let next = upsertByIdOrName(all, withUuid);
  // Only one server may be marked favorite at a time — clear it on every other.
  if (withUuid.isFavorite) {
    next = next.map((s) => (s.id === withUuid.id ? s : { ...s, isFavorite: false }));
  }
  const validated = parseWith(
    ServersFileSchema,
    { servers: next },
    path.join(getDataDir(opts.dataDir), SERVERS_FILE),
  );
  await writeCollection(SERVERS_FILE, "servers", validated.servers, getDataDir(opts.dataDir));
}
export async function deleteServer(name: string, opts: StoreOptions = {}) {
  assertSafeName(name);
  const all = await readAllServers(opts);
  const next = all.filter((s) => s.name !== name);
  if (next.length === all.length) return;
  await writeCollection(SERVERS_FILE, "servers", next, getDataDir(opts.dataDir));
}

/* ---------- CoA server simulator presets (data/profiles/coa_server.yaml) ---------- */

export async function readAllCoAConfigs(opts: StoreOptions = {}): Promise<CoAConfig[]> {
  return readCollection<CoAConfig>(
    COA_SERVER_FILE,
    CoAServerFileSchema as unknown as z.ZodType<{ [k: string]: CoAConfig[] }>,
    "coa_server",
    getDataDir(opts.dataDir),
  );
}
export async function listCoAConfigs(opts: StoreOptions = {}): Promise<string[]> {
  return (await readAllCoAConfigs(opts)).map((c) => c.name).sort();
}
export async function readCoA(name: string, opts: StoreOptions = {}): Promise<CoAConfig> {
  assertSafeName(name);
  const all = await readAllCoAConfigs(opts);
  const found = all.find((c) => c.name === name);
  if (!found) throw new YamlStoreError(`CoA config not found: ${name}`);
  return found;
}
export async function readCoAById(id: string, opts: StoreOptions = {}): Promise<CoAConfig | null> {
  const all = await readAllCoAConfigs(opts);
  return all.find((c) => c.id === id) ?? null;
}
export async function writeCoA(value: CoAConfig, opts: StoreOptions = {}) {
  const withUuid = withId(value);
  assertSafeName(withUuid.name);
  const all = await readAllCoAConfigs(opts);
  const next = upsertByIdOrName(all, withUuid);
  const validated = parseWith(
    CoAServerFileSchema,
    { coa_server: next },
    path.join(getDataDir(opts.dataDir), COA_SERVER_FILE),
  );
  await writeCollection(
    COA_SERVER_FILE,
    "coa_server",
    validated.coa_server,
    getDataDir(opts.dataDir),
  );
}
export async function deleteCoA(name: string, opts: StoreOptions = {}) {
  assertSafeName(name);
  const all = await readAllCoAConfigs(opts);
  const next = all.filter((c) => c.name !== name);
  if (next.length === all.length) return;
  await writeCollection(COA_SERVER_FILE, "coa_server", next, getDataDir(opts.dataDir));
}

/* ---------- CoA sender packet profiles (data/profiles/coa_sender.yaml) ---------- */

export async function readAllCoAPackets(opts: StoreOptions = {}): Promise<CoAPacketProfile[]> {
  return readCollection<CoAPacketProfile>(
    COA_SENDER_FILE,
    CoASenderFileSchema as unknown as z.ZodType<{ [k: string]: CoAPacketProfile[] }>,
    "coa_sender",
    getDataDir(opts.dataDir),
  );
}
export async function listCoAPackets(opts: StoreOptions = {}): Promise<string[]> {
  return (await readAllCoAPackets(opts)).map((p) => p.name).sort();
}
export async function readCoAPacket(
  name: string,
  opts: StoreOptions = {},
): Promise<CoAPacketProfile> {
  assertSafeName(name);
  const all = await readAllCoAPackets(opts);
  const found = all.find((p) => p.name === name);
  if (!found) throw new YamlStoreError(`CoA packet profile not found: ${name}`);
  return found;
}
export async function readCoAPacketById(
  id: string,
  opts: StoreOptions = {},
): Promise<CoAPacketProfile | null> {
  const all = await readAllCoAPackets(opts);
  return all.find((p) => p.id === id) ?? null;
}
export async function writeCoAPacket(value: CoAPacketProfile, opts: StoreOptions = {}) {
  const withUuid = withId(value);
  assertSafeName(withUuid.name);
  const all = await readAllCoAPackets(opts);
  const next = upsertByIdOrName(all, withUuid);
  const validated = parseWith(
    CoASenderFileSchema,
    { coa_sender: next },
    path.join(getDataDir(opts.dataDir), COA_SENDER_FILE),
  );
  await writeCollection(
    COA_SENDER_FILE,
    "coa_sender",
    validated.coa_sender,
    getDataDir(opts.dataDir),
  );
}
export async function deleteCoAPacket(name: string, opts: StoreOptions = {}) {
  assertSafeName(name);
  const all = await readAllCoAPackets(opts);
  const next = all.filter((p) => p.name !== name);
  if (next.length === all.length) return;
  await writeCollection(COA_SENDER_FILE, "coa_sender", next, getDataDir(opts.dataDir));
}

/* ---------- Test fixtures (data/tests/<name>.yaml — one file per fixture) ---------- */

function testFileForName(name: string, dataDir: string): string {
  assertSafeName(name);
  return path.join(dataDir, TESTS_DIR, `${name}.yaml`);
}

export async function listTests(opts: StoreOptions = {}): Promise<string[]> {
  const dir = path.join(getDataDir(opts.dataDir), TESTS_DIR);
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
export async function readTest(name: string, opts: StoreOptions = {}): Promise<TestFixture> {
  const file = testFileForName(name, getDataDir(opts.dataDir));
  const text = await fs.readFile(file, "utf8");
  let parsed: unknown;
  try {
    parsed = YAML.parse(text);
  } catch (err) {
    throw new YamlStoreError(`Failed to parse YAML at ${file}`, err);
  }
  return parseWith(TestFixtureSchema, parsed, file);
}
export async function writeTest(name: string, value: TestFixture, opts: StoreOptions = {}) {
  const parsed = TestFixtureSchema.parse(value);
  const file = testFileForName(name, getDataDir(opts.dataDir));
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, YAML.stringify(parsed, { indent: 2, lineWidth: 0 }), "utf8");
}
export async function deleteTest(name: string, opts: StoreOptions = {}) {
  const file = testFileForName(name, getDataDir(opts.dataDir));
  try {
    await fs.unlink(file);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
}

/** Raw YAML read — skips validation. Useful for editor preview when schema might not match. */
export async function readRawTestYaml(name: string, opts: StoreOptions = {}): Promise<string> {
  return fs.readFile(testFileForName(name, getDataDir(opts.dataDir)), "utf8");
}
export async function writeRawTestYaml(
  name: string,
  yamlText: string,
  opts: StoreOptions = {},
) {
  const file = testFileForName(name, getDataDir(opts.dataDir));
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, yamlText, "utf8");
}

/* ---------- Dictionary config (data/profiles/dictionary.yaml) ---------- */

/** Returns null if the file is absent — caller decides how to seed. */
export async function readDictionaryConfig(
  opts: StoreOptions = {},
): Promise<DictionaryConfig | null> {
  const abs = path.join(getDataDir(opts.dataDir), DICTIONARY_CONFIG_FILE);
  const text = await readFileIfExists(abs);
  if (text === null) return null;
  let parsed: unknown;
  try {
    parsed = YAML.parse(text);
  } catch (err) {
    throw new YamlStoreError(`Failed to parse YAML at ${abs}`, err);
  }
  return parseWith(DictionaryConfigFileSchema, parsed ?? { dictionary: { enabled: [] } }, abs)
    .dictionary;
}

export async function writeDictionaryConfig(
  cfg: DictionaryConfig,
  opts: StoreOptions = {},
): Promise<void> {
  const validated = DictionaryConfigFileSchema.parse({ dictionary: cfg });
  const abs = path.join(getDataDir(opts.dataDir), DICTIONARY_CONFIG_FILE);
  await ensureDir(path.dirname(abs));
  await fs.writeFile(abs, YAML.stringify(validated, { indent: 2, lineWidth: 0 }), "utf8");
}

/* ---------- Dictionary files (data/dictionary/dictionary.<id>) ---------- */

function userDictPath(id: string, dataDir: string): string {
  if (!/^[A-Za-z0-9_.-]+$/.test(id) || id.length === 0 || id.length > 64) {
    throw new YamlStoreError(`invalid dictionary id: ${id}`);
  }
  return path.join(dataDir, DICTIONARY_DIR, `dictionary.${id}`);
}

export async function readLocalDict(opts: StoreOptions = {}): Promise<string> {
  const file = userDictPath(LOCAL_DICT_ID, getDataDir(opts.dataDir));
  const text = await readFileIfExists(file);
  return text ?? "";
}

export async function writeLocalDict(
  content: string,
  opts: StoreOptions = {},
): Promise<void> {
  const file = userDictPath(LOCAL_DICT_ID, getDataDir(opts.dataDir));
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, content, "utf8");
}
