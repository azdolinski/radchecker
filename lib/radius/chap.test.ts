import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { encodeChap } from "./chap";

describe("encodeChap", () => {
  it("produces 16-byte challenge and 17-byte password", () => {
    const r = encodeChap("hunter2");
    expect(r.challenge).toHaveLength(16);
    expect(r.password).toHaveLength(17);
  });

  it("first byte of password equals chap_id", () => {
    const r = encodeChap("hunter2");
    expect(r.password[0]).toBe(r.id);
  });

  it("rest of password is MD5(id || password || challenge)", () => {
    const r = encodeChap("secret");
    const expected = createHash("md5")
      .update(Buffer.concat([Buffer.from([r.id]), Buffer.from("secret", "utf8"), r.challenge]))
      .digest();
    expect(r.password.subarray(1)).toEqual(expected);
  });

  it("never returns chap_id == 48 (pyrad bug compat)", () => {
    for (let i = 0; i < 500; i++) {
      const r = encodeChap("x");
      expect(r.id).not.toBe(48);
    }
  });

  it("challenge is random between calls", () => {
    const a = encodeChap("p");
    const b = encodeChap("p");
    expect(a.challenge).not.toEqual(b.challenge);
  });
});
