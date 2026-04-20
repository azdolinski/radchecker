import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  __resetForTests,
  getActivationReport,
  getActiveAttributes,
  initDictionaries,
  rebuildIndex,
  DEFAULT_ENABLED_BUILTIN,
} from "./dictionaryIndex";

let tmpDir: string;

beforeEach(async () => {
  __resetForTests();
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "radchecker-dict-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("dictionaryIndex.initDictionaries", () => {
  it("seeds data/profiles/dictionary.yaml wrapped like other profile files", async () => {
    await initDictionaries({ baseDataDir: tmpDir, loadIntoRadius: false });
    const yaml = await fs.readFile(path.join(tmpDir, "profiles", "dictionary.yaml"), "utf8");
    expect(yaml).toMatch(/^dictionary:\s*\n\s+enabled:/m);
    for (const id of DEFAULT_ENABLED_BUILTIN) {
      expect(yaml).toContain(id);
    }
  });

  it("seeds data/dictionary/dictionary.local on first run", async () => {
    await initDictionaries({ baseDataDir: tmpDir, loadIntoRadius: false });
    const localPath = path.join(tmpDir, "dictionary", "dictionary.local");
    const text = await fs.readFile(localPath, "utf8");
    expect(text).toMatch(/dictionary\.local/);
  });

  it("populates attribute index from default enabled built-ins", async () => {
    await initDictionaries({ baseDataDir: tmpDir, loadIntoRadius: false });
    const attrs = getActiveAttributes();
    expect(attrs.some((a) => a.name === "User-Name")).toBe(true);
    expect(attrs.some((a) => a.name === "Mikrotik-Rate-Limit")).toBe(true);
  });

  it("picks up shell-dropped user dict files unconditionally", async () => {
    await initDictionaries({ baseDataDir: tmpDir, loadIntoRadius: false });
    const dropPath = path.join(tmpDir, "dictionary", "dictionary.acme");
    await fs.writeFile(
      dropPath,
      "VENDOR Acme 99999\nBEGIN-VENDOR Acme\nATTRIBUTE Acme-Widget 1 string\nEND-VENDOR Acme\n",
      "utf8",
    );
    await rebuildIndex(tmpDir);
    const attrs = getActiveAttributes();
    expect(attrs.some((a) => a.name === "Acme-Widget")).toBe(true);
    await fs.rm(dropPath);
    await rebuildIndex(tmpDir);
    const attrs2 = getActiveAttributes();
    expect(attrs2.some((a) => a.name === "Acme-Widget")).toBe(false);
  });

  it("disabling a built-in removes its attributes from the index", async () => {
    await initDictionaries({ baseDataDir: tmpDir, loadIntoRadius: false });
    await fs.writeFile(
      path.join(tmpDir, "profiles", "dictionary.yaml"),
      "dictionary:\n  enabled:\n    - rfc2865\n",
      "utf8",
    );
    await rebuildIndex(tmpDir);
    const attrs = getActiveAttributes();
    expect(attrs.some((a) => a.name === "Mikrotik-Rate-Limit")).toBe(false);
    expect(attrs.some((a) => a.name === "User-Name")).toBe(true);
  });

  it("reports parse errors as warnings instead of crashing", async () => {
    await initDictionaries({ baseDataDir: tmpDir, loadIntoRadius: false });
    const dropPath = path.join(tmpDir, "dictionary", "dictionary.bad");
    await fs.writeFile(dropPath, "ATTRIBUTE Broken\n", "utf8");
    const report = await rebuildIndex(tmpDir);
    expect(report.user.some((u) => u.id === "bad" && !!u.error)).toBe(true);
    expect(report.warnings.some((w) => w.includes("dictionary.bad"))).toBe(true);
  });

  it("activation report lists 20 rfc + 5 vendor built-ins", async () => {
    await initDictionaries({ baseDataDir: tmpDir, loadIntoRadius: false });
    const report = getActivationReport();
    const rfcCount = report.builtin.filter((b) => b.source === "rfc").length;
    const vendorCount = report.builtin.filter((b) => b.source === "vendor").length;
    expect(rfcCount).toBe(20);
    expect(vendorCount).toBe(5);
  });
});
