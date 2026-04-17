import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  deleteProfile,
  listProfiles,
  listServers,
  listTests,
  readProfile,
  readServer,
  readTest,
  writeProfile,
  writeServer,
  writeTest,
  YamlStoreError,
} from "./yamlStore";
import type { ClientProfile, ServerConfig, TestFixture } from "./schemas";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "radchecker-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("ServerConfig", () => {
  const sample: ServerConfig = {
    name: "default",
    host: "127.0.0.1",
    authPort: 1812,
    acctPort: 1813,
    secret: "testing123",
    timeoutMs: 5000,
    retries: 1,
  };

  it("writes then reads identically", async () => {
    await writeServer(sample, { dataDir: tmpDir });
    const loaded = await readServer("default", { dataDir: tmpDir });
    expect(loaded).toEqual(sample);
  });

  it("lists after write", async () => {
    await writeServer(sample, { dataDir: tmpDir });
    await writeServer({ ...sample, name: "prod" }, { dataDir: tmpDir });
    expect(await listServers({ dataDir: tmpDir })).toEqual(["default", "prod"]);
  });

  it("returns empty list when dir missing", async () => {
    expect(await listServers({ dataDir: path.join(tmpDir, "nope") })).toEqual([]);
  });

  it("rejects bad name (path traversal)", async () => {
    await expect(writeServer({ ...sample, name: "../etc/passwd" }, { dataDir: tmpDir })).rejects.toThrow();
  });

  it("rejects missing required fields at read", async () => {
    const bad = path.join(tmpDir, "profiles", "servers", "bad.yaml");
    await fs.mkdir(path.dirname(bad), { recursive: true });
    await fs.writeFile(bad, "host: 1.2.3.4\n", "utf8");
    await expect(readServer("bad", { dataDir: tmpDir })).rejects.toBeInstanceOf(YamlStoreError);
  });
});

describe("ClientProfile", () => {
  const sample: ClientProfile = {
    name: "azdolinski",
    user: { username: "azdolinski", password: "azdolinski", authType: "pap" },
    nas: { ip: "172.20.5.14", portId: "eth0/0/1", portType: "Ethernet" },
    session: {
      framedIp: "10.0.0.100",
      serviceType: "Framed-User",
      framedProtocol: "PPP",
      acctAuthentic: "RADIUS",
      durationSeconds: 60,
      interimIntervalSeconds: 10,
    },
    traffic: {
      inputBytesPerInterval: [524288, 1048576],
      outputBytesPerInterval: [1048576, 2097152],
    },
  };

  it("writes and reads roundtrip", async () => {
    await writeProfile(sample, { dataDir: tmpDir });
    const loaded = await readProfile("azdolinski", { dataDir: tmpDir });
    expect(loaded.user.username).toBe("azdolinski");
    expect(loaded.traffic.inputBytesPerInterval).toEqual([524288, 1048576]);
  });

  it("delete removes file", async () => {
    await writeProfile(sample, { dataDir: tmpDir });
    expect(await listProfiles({ dataDir: tmpDir })).toContain("azdolinski");
    await deleteProfile("azdolinski", { dataDir: tmpDir });
    expect(await listProfiles({ dataDir: tmpDir })).not.toContain("azdolinski");
  });

  it("delete on missing is idempotent", async () => {
    await expect(deleteProfile("ghost", { dataDir: tmpDir })).resolves.toBeUndefined();
  });

  it("applies zod defaults for traffic", async () => {
    const minimal = { ...sample, traffic: undefined } as unknown as ClientProfile;
    await writeProfile(minimal, { dataDir: tmpDir });
    const loaded = await readProfile("azdolinski", { dataDir: tmpDir });
    expect(loaded.traffic.inputBytesPerInterval.length).toBe(2);
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
