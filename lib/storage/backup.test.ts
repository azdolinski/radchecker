import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  applyBundle,
  buildBundle,
  BundleParseError,
  mergeCollection,
  parseBundle,
} from "./backup";

let tmpDir: string;

async function writeYaml(rel: string, data: unknown) {
  const abs = path.join(tmpDir, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, YAML.stringify(data), "utf8");
}

async function readYaml<T = unknown>(rel: string): Promise<T> {
  return YAML.parse(await fs.readFile(path.join(tmpDir, rel), "utf8")) as T;
}

async function fileExists(rel: string): Promise<boolean> {
  try {
    await fs.access(path.join(tmpDir, rel));
    return true;
  } catch {
    return false;
  }
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "radchecker-backup-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("buildBundle", () => {
  beforeEach(async () => {
    await writeYaml("profiles/clients.yaml", { clients: [{ id: "c1", name: "alice" }] });
    await writeYaml("profiles/servers.yaml", { servers: [{ id: "s1", name: "primary" }] });
    await writeYaml("tests/t1.yaml", { test: { name: "t1" } });
    await writeYaml("tests/sub/t2.yaml", { test: { name: "t2" } });
    // runtime-owned dir that must be ignored by bundle (not by walker, but
    // nothing under tests/ or profiles/ — put a stray file to confirm walker
    // stays within requested subdirs).
    await fs.mkdir(path.join(tmpDir, "jobs"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "jobs", "meta.json"), "{}", "utf8");
  });

  it("scope=all collects profiles/ and tests/ yaml files", async () => {
    const bundle = await buildBundle("all", { dataDir: tmpDir });
    expect(bundle.version).toBe(1);
    expect(bundle.scope).toBe("all");
    expect(Object.keys(bundle.files).sort()).toEqual([
      "profiles/clients.yaml",
      "profiles/servers.yaml",
      "tests/sub/t2.yaml",
      "tests/t1.yaml",
    ]);
  });

  it("scope=profiles collects only profiles/", async () => {
    const bundle = await buildBundle("profiles", { dataDir: tmpDir });
    expect(Object.keys(bundle.files).sort()).toEqual([
      "profiles/clients.yaml",
      "profiles/servers.yaml",
    ]);
  });

  it("scope=tests collects only tests/", async () => {
    const bundle = await buildBundle("tests", { dataDir: tmpDir });
    expect(Object.keys(bundle.files).sort()).toEqual(["tests/sub/t2.yaml", "tests/t1.yaml"]);
  });

  it("never contains jobs/ entries even if jobs/*.yaml exists", async () => {
    await fs.writeFile(path.join(tmpDir, "jobs", "stray.yaml"), "x: 1\n", "utf8");
    const bundle = await buildBundle("all", { dataDir: tmpDir });
    expect(Object.keys(bundle.files).some((k) => k.startsWith("jobs/"))).toBe(false);
  });

  it("is empty when data dirs are missing", async () => {
    const empty = await fs.mkdtemp(path.join(os.tmpdir(), "radchecker-empty-"));
    try {
      const bundle = await buildBundle("all", { dataDir: empty });
      expect(bundle.files).toEqual({});
    } finally {
      await fs.rm(empty, { recursive: true, force: true });
    }
  });
});

describe("parseBundle", () => {
  const validBundle = {
    version: 1,
    createdAt: "2026-04-20T00:00:00Z",
    scope: "all",
    files: {
      "profiles/clients.yaml": { content: "clients: []\n" },
    },
  };

  it("accepts a well-formed bundle", () => {
    const b = parseBundle(YAML.stringify(validBundle));
    expect(b.version).toBe(1);
    expect(b.scope).toBe("all");
    expect(b.files["profiles/clients.yaml"].content).toBe("clients: []\n");
  });

  it("rejects invalid YAML", () => {
    expect(() => parseBundle("::: not yaml :::")).toThrow(BundleParseError);
  });

  it("rejects unsupported version", () => {
    const bad = { ...validBundle, version: 2 };
    expect(() => parseBundle(YAML.stringify(bad))).toThrow(/unsupported version/);
  });

  it("rejects missing files object", () => {
    const bad = { version: 1, scope: "all", createdAt: "x" };
    expect(() => parseBundle(YAML.stringify(bad))).toThrow(/files/);
  });

  it("rejects invalid scope", () => {
    const bad = { ...validBundle, scope: "everything" };
    expect(() => parseBundle(YAML.stringify(bad))).toThrow(/invalid scope/);
  });

  it("rejects path traversal in file keys", () => {
    const bad = {
      ...validBundle,
      files: { "../etc/passwd.yaml": { content: "x" } },
    };
    expect(() => parseBundle(YAML.stringify(bad))).toThrow(/invalid path/);
  });

  it("rejects jobs/ paths", () => {
    const bad = {
      ...validBundle,
      files: { "jobs/meta.yaml": { content: "x" } },
    };
    expect(() => parseBundle(YAML.stringify(bad))).toThrow(/invalid path/);
  });

  it("rejects non-yaml file keys", () => {
    const bad = {
      ...validBundle,
      files: { "profiles/clients.json": { content: "x" } },
    };
    expect(() => parseBundle(YAML.stringify(bad))).toThrow(/invalid path/);
  });

  it("rejects non-string content", () => {
    const bad = {
      ...validBundle,
      files: { "profiles/clients.yaml": { content: 42 } },
    };
    expect(() => parseBundle(YAML.stringify(bad))).toThrow(/must be a string/);
  });
});

describe("mergeCollection", () => {
  it("keeps existing item on id collision", () => {
    const existing = YAML.stringify({
      clients: [{ id: "a", name: "local-alice" }],
    });
    const incoming = YAML.stringify({
      clients: [{ id: "a", name: "backup-alice" }],
    });
    const merged = YAML.parse(mergeCollection(existing, incoming, "clients")) as {
      clients: Array<{ id: string; name: string }>;
    };
    expect(merged.clients).toHaveLength(1);
    expect(merged.clients[0].name).toBe("local-alice");
  });

  it("appends incoming items that are not present locally", () => {
    const existing = YAML.stringify({ clients: [{ id: "a", name: "alice" }] });
    const incoming = YAML.stringify({ clients: [{ id: "b", name: "bob" }] });
    const merged = YAML.parse(mergeCollection(existing, incoming, "clients")) as {
      clients: Array<{ id: string; name: string }>;
    };
    expect(merged.clients.map((c) => c.id).sort()).toEqual(["a", "b"]);
  });

  it("treats missing existing file as empty", () => {
    const incoming = YAML.stringify({ servers: [{ id: "s1", name: "primary" }] });
    const merged = YAML.parse(mergeCollection("", incoming, "servers")) as {
      servers: Array<{ id: string; name: string }>;
    };
    expect(merged.servers).toHaveLength(1);
  });
});

describe("applyBundle", () => {
  const clientsBundleText = (items: Array<{ id: string; name: string }>) =>
    YAML.stringify({ clients: items });

  it("replace strategy overwrites existing collection file", async () => {
    await writeYaml("profiles/clients.yaml", { clients: [{ id: "local", name: "local" }] });
    const bundle = parseBundle(
      YAML.stringify({
        version: 1,
        createdAt: "x",
        scope: "profiles",
        files: {
          "profiles/clients.yaml": { content: clientsBundleText([{ id: "back", name: "back" }]) },
        },
      }),
    );
    const report = await applyBundle(bundle, "replace", { dataDir: tmpDir });
    expect(report.applied).toEqual(["profiles/clients.yaml"]);
    expect(report.skipped).toEqual([]);
    expect(report.errors).toEqual([]);
    const on = await readYaml<{ clients: Array<{ id: string }> }>("profiles/clients.yaml");
    expect(on.clients.map((c) => c.id)).toEqual(["back"]);
  });

  it("merge strategy preserves local items and appends new ones for collection files", async () => {
    await writeYaml("profiles/clients.yaml", { clients: [{ id: "a", name: "alice" }] });
    const bundle = parseBundle(
      YAML.stringify({
        version: 1,
        createdAt: "x",
        scope: "profiles",
        files: {
          "profiles/clients.yaml": {
            content: clientsBundleText([
              { id: "a", name: "alice-from-backup" },
              { id: "b", name: "bob" },
            ]),
          },
        },
      }),
    );
    const report = await applyBundle(bundle, "merge", { dataDir: tmpDir });
    expect(report.applied).toEqual(["profiles/clients.yaml"]);
    const on = await readYaml<{ clients: Array<{ id: string; name: string }> }>(
      "profiles/clients.yaml",
    );
    expect(on.clients.map((c) => c.id).sort()).toEqual(["a", "b"]);
    const alice = on.clients.find((c) => c.id === "a");
    expect(alice?.name).toBe("alice");
  });

  it("merge strategy skips existing single-fixture files", async () => {
    await writeYaml("tests/t1.yaml", { test: { name: "local-t1" } });
    const bundle = parseBundle(
      YAML.stringify({
        version: 1,
        createdAt: "x",
        scope: "tests",
        files: {
          "tests/t1.yaml": { content: YAML.stringify({ test: { name: "backup-t1" } }) },
          "tests/t2.yaml": { content: YAML.stringify({ test: { name: "backup-t2" } }) },
        },
      }),
    );
    const report = await applyBundle(bundle, "merge", { dataDir: tmpDir });
    expect(report.applied).toEqual(["tests/t2.yaml"]);
    expect(report.skipped).toEqual([
      { path: "tests/t1.yaml", reason: "already exists (merge keeps local)" },
    ]);
    const kept = await readYaml<{ test: { name: string } }>("tests/t1.yaml");
    expect(kept.test.name).toBe("local-t1");
    expect(await fileExists("tests/t2.yaml")).toBe(true);
  });

  it("replace strategy refuses unparseable YAML content", async () => {
    const bundle = parseBundle(
      YAML.stringify({
        version: 1,
        createdAt: "x",
        scope: "tests",
        files: { "tests/bad.yaml": { content: ":::\n::not yaml" } },
      }),
    );
    const report = await applyBundle(bundle, "replace", { dataDir: tmpDir });
    expect(report.applied).toEqual([]);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0].path).toBe("tests/bad.yaml");
    expect(await fileExists("tests/bad.yaml")).toBe(false);
  });

  it("creates parent directories as needed", async () => {
    const bundle = parseBundle(
      YAML.stringify({
        version: 1,
        createdAt: "x",
        scope: "tests",
        files: { "tests/deep/nested/t.yaml": { content: YAML.stringify({ test: { name: "x" } }) } },
      }),
    );
    const report = await applyBundle(bundle, "replace", { dataDir: tmpDir });
    expect(report.applied).toEqual(["tests/deep/nested/t.yaml"]);
    expect(await fileExists("tests/deep/nested/t.yaml")).toBe(true);
  });
});
