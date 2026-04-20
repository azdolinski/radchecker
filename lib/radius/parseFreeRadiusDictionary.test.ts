import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  DictionaryParseError,
  parseFreeRadiusDictionary,
} from "./parseFreeRadiusDictionary";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const RFC_DIR = path.join(REPO_ROOT, "node_modules", "radius", "dictionaries");
const VENDOR_DIR = path.join(REPO_ROOT, "lib", "radius", "vendor-dictionaries");

describe("parseFreeRadiusDictionary", () => {
  it("parses RFC 2865 core attributes", async () => {
    const text = await fs.readFile(path.join(RFC_DIR, "dictionary.rfc2865"), "utf8");
    const parsed = parseFreeRadiusDictionary(text);

    const userName = parsed.attributes.find((a) => a.name === "User-Name");
    expect(userName).toBeDefined();
    expect(userName!.code).toBe(1);
    expect(userName!.type).toBe("string");
    expect(userName!.vendor).toBeUndefined();

    const nasIp = parsed.attributes.find((a) => a.name === "NAS-IP-Address");
    expect(nasIp?.code).toBe(4);
    expect(nasIp?.type).toBe("ipaddr");
  });

  it("parses Mikrotik VSA with vendor context", async () => {
    const text = await fs.readFile(path.join(VENDOR_DIR, "dictionary.mikrotik"), "utf8");
    const parsed = parseFreeRadiusDictionary(text);

    expect(parsed.vendors).toEqual([{ name: "Mikrotik", id: 14988 }]);

    const rateLimit = parsed.attributes.find((a) => a.name === "Mikrotik-Rate-Limit");
    expect(rateLimit).toBeDefined();
    expect(rateLimit!.vendor).toBe("Mikrotik");
    expect(rateLimit!.vendorId).toBe(14988);
  });

  it("normalizes octets[N] type to octets", async () => {
    const text = await fs.readFile(path.join(VENDOR_DIR, "dictionary.microsoft"), "utf8");
    const parsed = parseFreeRadiusDictionary(text);
    const msChap = parsed.attributes.find((a) => a.name === "MS-CHAP-Response");
    expect(msChap?.type).toBe("octets");
  });

  it("collects VALUE entries", async () => {
    const text = await fs.readFile(path.join(VENDOR_DIR, "dictionary.microsoft"), "utf8");
    const parsed = parseFreeRadiusDictionary(text);
    const allowed = parsed.values.find(
      (v) => v.attribute === "MS-MPPE-Encryption-Policy" && v.valueName === "Encryption-Allowed",
    );
    expect(allowed?.valueNumber).toBe(1);
  });

  it("throws DictionaryParseError with line number on malformed ATTRIBUTE", () => {
    const bad = "\n\nATTRIBUTE Broken\n";
    try {
      parseFreeRadiusDictionary(bad);
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(DictionaryParseError);
      expect((err as DictionaryParseError).line).toBe(3);
      expect((err as DictionaryParseError).message).toMatch(/Line 3:/);
    }
  });

  it("throws on BEGIN-VENDOR with unknown vendor", () => {
    const bad = "BEGIN-VENDOR Acme\n";
    expect(() => parseFreeRadiusDictionary(bad)).toThrow(/unknown vendor/);
  });

  it("ignores comments and blank lines", () => {
    const text = `# header
VENDOR Acme 99999

BEGIN-VENDOR Acme
  # nested comment
ATTRIBUTE Acme-Widget 1 string
END-VENDOR Acme
`;
    const parsed = parseFreeRadiusDictionary(text);
    expect(parsed.vendors).toHaveLength(1);
    expect(parsed.attributes).toHaveLength(1);
    expect(parsed.attributes[0].vendor).toBe("Acme");
  });

  it("collects $INCLUDE directives", () => {
    const text = `$INCLUDE dictionary.other\nATTRIBUTE User-Name 1 string\n`;
    const parsed = parseFreeRadiusDictionary(text);
    expect(parsed.includes).toEqual(["dictionary.other"]);
    expect(parsed.attributes).toHaveLength(1);
  });
});
