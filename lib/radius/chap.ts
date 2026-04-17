import { createHash, randomBytes } from "node:crypto";

export interface ChapAttributes {
  /** 16 random bytes used as challenge. */
  challenge: Buffer;
  /** 1 byte id + 16 bytes MD5 digest — goes into CHAP-Password attribute. */
  password: Buffer;
  /** Raw chap_id used (exposed for tests). */
  id: number;
}

/**
 * Encode CHAP authentication attributes per RFC 2865 §2.2 / RFC 1994.
 *
 *   CHAP-Password = 1 byte identifier || MD5(identifier || password || challenge)
 *   CHAP-Challenge = 16 random bytes
 *
 * Implementation note: we skip `chap_id = 48` to stay symmetric with
 * tmp/tests/performance_test.py (pyrad has a long-standing bug where octets
 * starting with 0x30 are treated as a hex string). Not strictly needed for
 * our TS code, but keeps parity with the legacy reference.
 */
export function encodeChap(password: string): ChapAttributes {
  const challenge = randomBytes(16);
  let id = Math.floor(Math.random() * 255);
  if (id >= 48) id += 1;
  id = id & 0xff;

  const md5 = createHash("md5")
    .update(Buffer.concat([Buffer.from([id]), Buffer.from(password, "utf8"), challenge]))
    .digest();

  return {
    challenge,
    password: Buffer.concat([Buffer.from([id]), md5]),
    id,
  };
}
