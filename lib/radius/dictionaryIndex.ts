import { promises as fs } from "node:fs";

import {
  listBuiltin,
  listUserFiles,
  pathForLocalDict,
  userDictDir,
  LOCAL_DICT_ID,
  type DictionaryFileInfo,
} from "./dictionarySources";
import {
  parseFreeRadiusDictionary,
  DictionaryParseError,
  type AttributeType,
  type ParsedAttribute,
} from "./parseFreeRadiusDictionary";
import {
  readDictionaryConfig,
  writeDictionaryConfig,
} from "@/lib/storage/yamlStore";
import { dataDir } from "@/lib/storage/fsPaths";

export interface AttributeMeta {
  name: string;
  code: number;
  type: AttributeType;
  vendor?: string;
  vendorId?: number;
}

export interface DictionaryReport {
  id: string;
  source: "rfc" | "vendor" | "user";
  isLocal: boolean;
  enabled: boolean;
  attributeCount: number;
  valueCount: number;
  vendors: string[];
  sizeBytes?: number;
  error?: { line: number; message: string } | { message: string };
}

export interface ActivationReport {
  builtin: DictionaryReport[];
  user: DictionaryReport[];
  enabled: string[];
  warnings: string[];
}

export const DEFAULT_ENABLED_BUILTIN: string[] = [
  "rfc2865",
  "rfc2866",
  "rfc5176",
  "mikrotik",
];

const LOCAL_DICT_TEMPLATE = `# dictionary.local — user-editable RADIUS dictionary for this installation.
#
# This file is always loaded on app startup. Use FreeRADIUS dictionary syntax:
#
#   VENDOR        <vendor-name>        <vendor-id>
#   BEGIN-VENDOR  <vendor-name>
#   ATTRIBUTE     <name>               <code>   <type>
#   END-VENDOR    <vendor-name>
#
# Types: string, integer, ipaddr, ipv6addr, octets, date.
#
# Example:
#
#   VENDOR Acme 99999
#   BEGIN-VENDOR Acme
#   ATTRIBUTE Acme-Widget 1 string
#   END-VENDOR Acme
`;

interface IndexState {
  attributes: Map<string, AttributeMeta>;
  /** Attribute name → sorted list of VALUE names defined for it. */
  values: Map<string, string[]>;
  report: ActivationReport;
  baseDataDir: string;
}

let state: IndexState | null = null;
/** Bumped on every successful rebuildIndex — UI clients poll this to invalidate local caches. */
let revision = 0;

function freshReport(): ActivationReport {
  return { builtin: [], user: [], enabled: [], warnings: [] };
}

async function fileSize(p: string): Promise<number | undefined> {
  try {
    return (await fs.stat(p)).size;
  } catch {
    return undefined;
  }
}

async function readAndParse(
  info: DictionaryFileInfo,
): Promise<
  | { ok: true; parsed: ReturnType<typeof parseFreeRadiusDictionary> }
  | { ok: false; error: DictionaryReport["error"] }
> {
  try {
    const text = await fs.readFile(info.path, "utf8");
    return { ok: true, parsed: parseFreeRadiusDictionary(text) };
  } catch (err) {
    if (err instanceof DictionaryParseError) {
      return { ok: false, error: { line: err.line, message: err.message } };
    }
    return { ok: false, error: { message: (err as Error).message } };
  }
}

async function summarizeVendors(attrs: ParsedAttribute[]): Promise<string[]> {
  const names = new Set<string>();
  for (const a of attrs) {
    if (a.vendor) names.add(a.vendor);
  }
  return [...names].sort();
}

async function buildFor(
  info: DictionaryFileInfo,
  enabledForEncoder: boolean,
): Promise<{
  attrs: AttributeMeta[];
  values: Array<{ attribute: string; valueName: string }>;
  report: DictionaryReport;
}> {
  const size = await fileSize(info.path);
  const parsed = await readAndParse(info);
  if (!parsed.ok) {
    return {
      attrs: [],
      values: [],
      report: {
        id: info.id,
        source: info.source,
        isLocal: info.isLocal,
        enabled: enabledForEncoder,
        attributeCount: 0,
        valueCount: 0,
        vendors: [],
        sizeBytes: size,
        error: parsed.error,
      },
    };
  }
  const attrs: AttributeMeta[] = parsed.parsed.attributes.map((a) => ({
    name: a.name,
    code: a.code,
    type: a.type,
    vendor: a.vendor,
    vendorId: a.vendorId,
  }));
  const values = parsed.parsed.values.map((v) => ({
    attribute: v.attribute,
    valueName: v.valueName,
  }));
  return {
    attrs,
    values,
    report: {
      id: info.id,
      source: info.source,
      isLocal: info.isLocal,
      enabled: enabledForEncoder,
      attributeCount: attrs.length,
      valueCount: parsed.parsed.values.length,
      vendors: await summarizeVendors(parsed.parsed.attributes),
      sizeBytes: size,
    },
  };
}

/**
 * Load every bundled + user dict path into the radius lib's internal encoder
 * so runtime encoding never fails on known attribute names. Called once during
 * initDictionaries(). Subsequent calls are harmless (add_dictionary only
 * appends to a locations array), but the radius lib will NOT re-read files
 * after its first load, so shell-drops added at runtime need a restart.
 */
async function loadAllIntoRadius(baseDataDir: string): Promise<void> {
  const radius = (await import("radius")).default;
  const [builtin, user] = await Promise.all([
    listBuiltin(),
    listUserFiles(baseDataDir),
  ]);
  for (const info of builtin) radius.add_dictionary(info.path);
  for (const info of user) radius.add_dictionary(info.path);
  // Force lazy loader to run now, so first encode/decode doesn't surprise us.
  radius.load_dictionaries();
}

function isReadOnlyFsError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  return code === "EACCES" || code === "EROFS" || code === "EPERM";
}

async function seedLocalIfMissing(baseDataDir: string, warnings: string[]): Promise<void> {
  const dir = userDictDir(baseDataDir);
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (err) {
    if (!isReadOnlyFsError(err)) throw err;
    warnings.push(
      `cannot create ${dir}: ${(err as Error).message} — continuing without user dictionary directory`,
    );
    return;
  }
  const localPath = pathForLocalDict(baseDataDir);
  try {
    await fs.access(localPath);
    return;
  } catch {
    // missing — seed it below
  }
  try {
    await fs.writeFile(localPath, LOCAL_DICT_TEMPLATE, "utf8");
  } catch (err) {
    if (!isReadOnlyFsError(err)) throw err;
    warnings.push(
      `cannot seed ${localPath}: ${(err as Error).message} — editor will start empty until the path becomes writable`,
    );
  }
}

async function seedEnabledIfMissing(
  baseDataDir: string,
  warnings: string[],
): Promise<string[]> {
  const cfg = await readDictionaryConfig({ dataDir: baseDataDir });
  if (cfg !== null) return cfg.enabled;
  try {
    await writeDictionaryConfig({ enabled: DEFAULT_ENABLED_BUILTIN }, { dataDir: baseDataDir });
  } catch (err) {
    if (!isReadOnlyFsError(err)) throw err;
    warnings.push(
      `cannot seed data/dictionary.yaml: ${(err as Error).message} — defaults applied in-memory only`,
    );
  }
  return DEFAULT_ENABLED_BUILTIN;
}

export async function rebuildIndex(baseDataDir?: string): Promise<ActivationReport> {
  const base = baseDataDir ?? dataDir();
  const report = freshReport();
  const attributes = new Map<string, AttributeMeta>();
  const valueSets = new Map<string, Set<string>>();

  const cfg = await readDictionaryConfig({ dataDir: base });
  const enabled = new Set<string>(cfg?.enabled ?? DEFAULT_ENABLED_BUILTIN);
  report.enabled = [...enabled].sort();

  const absorb = (
    attrs: AttributeMeta[],
    values: Array<{ attribute: string; valueName: string }>,
  ) => {
    for (const a of attrs) attributes.set(a.name, a);
    for (const v of values) {
      let set = valueSets.get(v.attribute);
      if (!set) {
        set = new Set<string>();
        valueSets.set(v.attribute, set);
      }
      set.add(v.valueName);
    }
  };

  const [builtin, user] = await Promise.all([listBuiltin(), listUserFiles(base)]);

  for (const info of builtin) {
    const on = enabled.has(info.id);
    const { attrs, values, report: r } = await buildFor(info, on);
    report.builtin.push(r);
    if (r.error && on) {
      report.warnings.push(
        `dictionary.${info.id}: ${("line" in (r.error ?? {}) ? `line ${(r.error as { line: number }).line}: ` : "")}${r.error.message}`,
      );
    }
    if (!on) continue;
    absorb(attrs, values);
  }

  for (const info of user) {
    // All user files are always active in the UI index (matches "auto-loaded
    // from data/dictionary/" behavior).
    const { attrs, values, report: r } = await buildFor(info, true);
    report.user.push(r);
    if (r.error) {
      report.warnings.push(
        `dictionary.${info.id}: ${("line" in (r.error ?? {}) ? `line ${(r.error as { line: number }).line}: ` : "")}${r.error.message}`,
      );
    }
    absorb(attrs, values);
  }

  const values = new Map<string, string[]>();
  for (const [attr, set] of valueSets) values.set(attr, [...set].sort());

  state = { attributes, values, report, baseDataDir: base };
  revision += 1;
  return report;
}

export interface InitOptions {
  baseDataDir?: string;
  /** Tests can skip calling radius.add_dictionary() (global lib state). */
  loadIntoRadius?: boolean;
}

export async function initDictionaries(options: InitOptions = {}): Promise<ActivationReport> {
  const base = options.baseDataDir ?? dataDir();
  const seedWarnings: string[] = [];
  await seedLocalIfMissing(base, seedWarnings);
  await seedEnabledIfMissing(base, seedWarnings);
  if (options.loadIntoRadius ?? true) {
    await loadAllIntoRadius(base);
  }
  const report = await rebuildIndex(base);
  if (seedWarnings.length > 0) {
    report.warnings = [...seedWarnings, ...report.warnings];
    for (const w of seedWarnings) {
      // Surface once at startup so operators see it in docker logs.
      console.warn(`[dictionary] ${w}`);
    }
  }
  return report;
}

export function getActiveAttributes(): AttributeMeta[] {
  if (!state) return [];
  const list = [...state.attributes.values()];
  list.sort((a, b) => a.name.localeCompare(b.name));
  return list;
}

/** Sorted VALUE names per attribute across all enabled dictionaries. */
export function getActiveValuesByAttribute(): Record<string, string[]> {
  if (!state) return {};
  const out: Record<string, string[]> = {};
  for (const [attr, names] of state.values) out[attr] = names;
  return out;
}

export function getActivationReport(): ActivationReport {
  return state?.report ?? freshReport();
}

export function getRevision(): number {
  return revision;
}

/** Test helper — reset module state so multiple tests in the same file don't leak. */
export function __resetForTests(): void {
  state = null;
  revision = 0;
}

export { LOCAL_DICT_ID };
