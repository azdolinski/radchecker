import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  deleteCoA,
  deleteCoAPacket,
  deleteProfile,
  deleteServer,
  listCoAConfigs,
  listCoAPackets,
  listProfiles,
  listServers,
  listTests,
  readAllCoAConfigs,
  readAllCoAPackets,
  readAllProfiles,
  readAllServers,
  readCoA,
  readCoAPacket,
  readProfile,
  readServer,
  readServerById,
  readTest,
  writeCoA,
  writeCoAPacket,
  writeProfile,
  writeServer,
  writeTest,
  YamlStoreError,
} from "./yamlStore";
import type {
  ClientProfile,
  CoAConfig,
  CoAPacketProfile,
  ServerConfig,
  TestFixture,
} from "./schemas";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "radchecker-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("ServerConfig (collection file)", () => {
  const sample: ServerConfig = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "default",
    host: "127.0.0.1",
    authPort: 1812,
    acctPort: 1813,
    coaPort: 3799,
    secret: "testing123",
    timeoutMs: 5000,
    retries: 1,
    isFavorite: false,
  };

  it("writes then reads identically", async () => {
    await writeServer(sample, { dataDir: tmpDir });
    expect(await readServer("default", { dataDir: tmpDir })).toEqual(sample);
  });

  it("two writes produce one file with two entries", async () => {
    await writeServer(sample, { dataDir: tmpDir });
    await writeServer({ ...sample, id: "22222222-2222-4222-8222-222222222222", name: "prod" }, { dataDir: tmpDir });
    const all = await readAllServers({ dataDir: tmpDir });
    expect(all).toHaveLength(2);
    expect(await listServers({ dataDir: tmpDir })).toEqual(["default", "prod"]);
    const fileExists = await fs
      .stat(path.join(tmpDir, "profiles", "servers.yaml"))
      .then(() => true)
      .catch(() => false);
    expect(fileExists).toBe(true);
  });

  it("upserts in place when name matches", async () => {
    await writeServer(sample, { dataDir: tmpDir });
    await writeServer({ ...sample, host: "10.0.0.1" }, { dataDir: tmpDir });
    const all = await readAllServers({ dataDir: tmpDir });
    expect(all).toHaveLength(1);
    expect(all[0].host).toBe("10.0.0.1");
  });

  it("deleteServer removes one entry, leaves others", async () => {
    await writeServer(sample, { dataDir: tmpDir });
    await writeServer({ ...sample, id: "22222222-2222-4222-8222-222222222222", name: "prod" }, { dataDir: tmpDir });
    await deleteServer("default", { dataDir: tmpDir });
    expect(await listServers({ dataDir: tmpDir })).toEqual(["prod"]);
  });

  it("deleteServer is idempotent for missing name", async () => {
    await expect(deleteServer("ghost", { dataDir: tmpDir })).resolves.toBeUndefined();
  });

  it("returns empty list when file missing", async () => {
    expect(await readAllServers({ dataDir: path.join(tmpDir, "nope") })).toEqual([]);
    expect(await listServers({ dataDir: path.join(tmpDir, "nope") })).toEqual([]);
  });

  it("rejects write with bad name (path traversal)", async () => {
    await expect(
      writeServer({ ...sample, name: "../etc/passwd" }, { dataDir: tmpDir }),
    ).rejects.toThrow();
  });

  it("readServer throws YamlStoreError when name missing", async () => {
    await writeServer(sample, { dataDir: tmpDir });
    await expect(readServer("ghost", { dataDir: tmpDir })).rejects.toBeInstanceOf(YamlStoreError);
  });

  it("rejects collection with duplicate id", async () => {
    const file = path.join(tmpDir, "profiles", "servers.yaml");
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(
      file,
      YAML.stringify({
        servers: [sample, { ...sample, name: "other" }],
      }),
      "utf8",
    );
    await expect(readAllServers({ dataDir: tmpDir })).rejects.toBeInstanceOf(YamlStoreError);
  });

  it("readServerById locates by UUID", async () => {
    await writeServer(sample, { dataDir: tmpDir });
    const found = await readServerById(sample.id, { dataDir: tmpDir });
    expect(found?.name).toBe("default");
    expect(await readServerById("nope", { dataDir: tmpDir })).toBeNull();
  });

  it("writing a favorite clears any previous favorite", async () => {
    const a = { ...sample, isFavorite: true };
    const b = {
      ...sample,
      id: "22222222-2222-4222-8222-222222222222",
      name: "prod",
      isFavorite: true,
    };
    await writeServer(a, { dataDir: tmpDir });
    await writeServer(b, { dataDir: tmpDir });
    const all = await readAllServers({ dataDir: tmpDir });
    const favorites = all.filter((s) => s.isFavorite);
    expect(favorites).toHaveLength(1);
    expect(favorites[0].name).toBe("prod");
  });

  it("defaults isFavorite to false when absent from on-disk YAML", async () => {
    const file = path.join(tmpDir, "profiles", "servers.yaml");
    await fs.mkdir(path.dirname(file), { recursive: true });
    // Legacy shape: no isFavorite key.
    const { isFavorite: _omit, ...legacy } = sample;
    void _omit;
    await fs.writeFile(file, YAML.stringify({ servers: [legacy] }), "utf8");
    const all = await readAllServers({ dataDir: tmpDir });
    expect(all).toHaveLength(1);
    expect(all[0].isFavorite).toBe(false);
  });

  it("clearing a favorite does not promote any other server", async () => {
    const a = { ...sample, isFavorite: true };
    const b = {
      ...sample,
      id: "22222222-2222-4222-8222-222222222222",
      name: "prod",
      isFavorite: false,
    };
    await writeServer(a, { dataDir: tmpDir });
    await writeServer(b, { dataDir: tmpDir });
    await writeServer({ ...a, isFavorite: false }, { dataDir: tmpDir });
    const all = await readAllServers({ dataDir: tmpDir });
    expect(all.every((s) => !s.isFavorite)).toBe(true);
  });
});

describe("ClientProfile (collection file)", () => {
  const sample: ClientProfile = {
    id: "22222222-2222-4222-8222-222222222222",
    name: "sample-user",
    user: { username: "sample-user", password: "sample-user", authType: "pap" },
    nas: { ip: "172.20.5.14", portId: "eth0/0/1", portType: "Ethernet" },
    session: {
      attributes: [
        { name: "Framed-IP-Address", value: "10.0.0.100" },
        { name: "Service-Type", value: "Framed-User" },
        { name: "Framed-Protocol", value: "PPP" },
        { name: "Acct-Authentic", value: "RADIUS" },
      ],
    },
    accounting: {
      disabled: false,
      durationSeconds: 60,
      interimIntervalSeconds: 10,
      traffic: {
        inputBytesPerInterval: [524288, 1048576],
        outputBytesPerInterval: [1048576, 2097152],
      },
    },
  };

  it("writes and reads roundtrip", async () => {
    await writeProfile(sample, { dataDir: tmpDir });
    const loaded = await readProfile("sample-user", { dataDir: tmpDir });
    expect(loaded.user.username).toBe("sample-user");
    expect(loaded.accounting.traffic.inputBytesPerInterval).toEqual([524288, 1048576]);
  });

  it("persists into a single collection file", async () => {
    await writeProfile(sample, { dataDir: tmpDir });
    const text = await fs.readFile(path.join(tmpDir, "profiles", "clients.yaml"), "utf8");
    expect(text).toMatch(/^clients:/m);
  });

  it("delete removes entry", async () => {
    await writeProfile(sample, { dataDir: tmpDir });
    expect(await listProfiles({ dataDir: tmpDir })).toContain("sample-user");
    await deleteProfile("sample-user", { dataDir: tmpDir });
    expect(await listProfiles({ dataDir: tmpDir })).not.toContain("sample-user");
  });

  it("delete on missing is idempotent", async () => {
    await expect(deleteProfile("ghost", { dataDir: tmpDir })).resolves.toBeUndefined();
  });

  it("applies zod defaults for accounting block", async () => {
    const minimal = { ...sample, accounting: undefined } as unknown as ClientProfile;
    await writeProfile(minimal, { dataDir: tmpDir });
    const loaded = await readProfile("sample-user", { dataDir: tmpDir });
    expect(loaded.accounting.disabled).toBe(false);
    expect(loaded.accounting.durationSeconds).toBe(60);
    expect(loaded.accounting.interimIntervalSeconds).toBe(10);
    expect(loaded.accounting.traffic.inputBytesPerInterval.length).toBe(2);
  });

  it("round-trips accounting.disabled = true", async () => {
    const off = {
      ...sample,
      accounting: { ...sample.accounting, disabled: true },
    };
    await writeProfile(off, { dataDir: tmpDir });
    const loaded = await readProfile("sample-user", { dataDir: tmpDir });
    expect(loaded.accounting.disabled).toBe(true);
  });

  it("readAllProfiles returns empty when file missing", async () => {
    expect(await readAllProfiles({ dataDir: tmpDir })).toEqual([]);
  });
});

describe("CoAConfig (collection file)", () => {
  const sample: CoAConfig = {
    id: "33333333-3333-4333-8333-333333333333",
    name: "default",
    bind: "0.0.0.0",
    port: 3799,
    secret: "testing123",
    policy: "always-ack",
  };

  it("write/read roundtrip via coa_server.yaml", async () => {
    await writeCoA(sample, { dataDir: tmpDir });
    expect(await readCoA("default", { dataDir: tmpDir })).toEqual(sample);
    const text = await fs.readFile(
      path.join(tmpDir, "profiles", "coa_server.yaml"),
      "utf8",
    );
    expect(text).toMatch(/^coa_server:/m);
  });

  it("lists CoA configs", async () => {
    await writeCoA(sample, { dataDir: tmpDir });
    await writeCoA(
      { ...sample, id: "44444444-4444-4444-8444-444444444444", name: "alt" },
      { dataDir: tmpDir },
    );
    expect(await listCoAConfigs({ dataDir: tmpDir })).toEqual(["alt", "default"]);
  });

  it("deleteCoA removes one entry", async () => {
    await writeCoA(sample, { dataDir: tmpDir });
    await deleteCoA("default", { dataDir: tmpDir });
    expect(await readAllCoAConfigs({ dataDir: tmpDir })).toEqual([]);
  });
});

describe("CoAPacketProfile (collection file)", () => {
  const sample: CoAPacketProfile = {
    id: "55555555-5555-4555-8555-555555555555",
    name: "kick",
    type: "Disconnect-Request",
    target: { server: { host: "127.0.0.1", port: 3799, secret: "x", timeoutMs: 5000, retries: 1 } },
    attributes: [{ name: "User-Name", value: "alice" }],
  };

  it("write/read roundtrip via coa_sender.yaml", async () => {
    await writeCoAPacket(sample, { dataDir: tmpDir });
    const loaded = await readCoAPacket("kick", { dataDir: tmpDir });
    expect(loaded.attributes[0]).toEqual({ name: "User-Name", value: "alice" });
    const text = await fs.readFile(
      path.join(tmpDir, "profiles", "coa_sender.yaml"),
      "utf8",
    );
    expect(text).toMatch(/^coa_sender:/m);
  });

  it("lists CoA packets", async () => {
    await writeCoAPacket(sample, { dataDir: tmpDir });
    expect(await listCoAPackets({ dataDir: tmpDir })).toEqual(["kick"]);
  });

  it("deleteCoAPacket removes one entry", async () => {
    await writeCoAPacket(sample, { dataDir: tmpDir });
    await deleteCoAPacket("kick", { dataDir: tmpDir });
    expect(await readAllCoAPackets({ dataDir: tmpDir })).toEqual([]);
  });
});

describe("TestFixture (compat with tmp/tests/data format)", () => {
  const sample: TestFixture = {
    test: { name: "MAC Auth valid", description: "requires Agent-Circuit-Id" },
    api: {
      pre_cleanup: true,
      cleanup: true,
      setup: {
        users: [
          {
            username: "MAC001122000000",
            check_attrs: [{ attribute: "NAS-Port-Type", op: ":=", value: "Ethernet" }],
            reply_attrs: [{ attribute: "Mikrotik-Rate-Limit", op: "=", value: "21M/21M" }],
          },
        ],
      },
    },
    radius: {
      server: { host: "127.0.0.1", port: 1812, secret: "testing123" },
      request: {
        "User-Name": "00:11:22:00:00:00",
        "NAS-Port-Type": "Ethernet",
        "NAS-IP-Address": "10.11.0.3",
        "Agent-Circuit-Id": "TEST123",
      },
      reply: {
        "Message-Authenticator": "any",
        "Framed-Pool": "ippool-TEST123-trusted",
        "Mikrotik-Rate-Limit": "21M/21M",
      },
      expect: "Access-Accept",
    },
  };

  it("parses legacy-shape fixture", async () => {
    await writeTest("auth_test001a", sample, { dataDir: tmpDir });
    const loaded = await readTest("auth_test001a", { dataDir: tmpDir });
    expect(loaded.test.name).toBe("MAC Auth valid");
    expect(loaded.radius.expect).toBe("Access-Accept");
    expect(loaded.radius.request["User-Name"]).toBe("00:11:22:00:00:00");
  });

  it("lists tests alphabetically", async () => {
    await writeTest("b_test", sample, { dataDir: tmpDir });
    await writeTest("a_test", sample, { dataDir: tmpDir });
    expect(await listTests({ dataDir: tmpDir })).toEqual(["a_test", "b_test"]);
  });

  it("rejects invalid expect code", async () => {
    const bad = path.join(tmpDir, "tests", "bad.yaml");
    await fs.mkdir(path.dirname(bad), { recursive: true });
    await fs.writeFile(
      bad,
      "test:\n  name: x\nradius:\n  server:\n    host: x\n    port: 1812\n    secret: x\n  request: {}\n  expect: Invalid-Code\n",
      "utf8",
    );
    await expect(readTest("bad", { dataDir: tmpDir })).rejects.toBeInstanceOf(YamlStoreError);
  });
});
