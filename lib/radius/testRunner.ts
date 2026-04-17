import { randomBytes } from "node:crypto";
import type { AttributeTuple } from "radius";

import { sendRadiusPacket } from "./client";
import type { TestFixture } from "@/lib/storage/schemas";

export interface AttributeFailure {
  attribute: string;
  expected: string | number;
  actual: string | number | undefined;
  reason: "missing" | "should_not_exist" | "mismatch";
}

export interface TestRunResult {
  name: string;
  expected: string;
  actual?: string;
  pass: boolean;
  durationMs: number;
  error?: string;
  /** Attribute-level assertion failures (if expected code matched). */
  attributeFailures: AttributeFailure[];
  attributesReceived: Record<string, string | number>;
}

function normalizeValue(value: unknown): string | number | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return value.length ? String(value[0]) : undefined;
  if (Buffer.isBuffer(value)) return value.toString();
  return value as string | number;
}

/**
 * Compare one expected attribute against the actual reply.
 *
 * Semantics mirror tmp/tests/test_auth.py:
 *   - "any" / "*"      → must exist, any value
 *   - "not-exist"      → must NOT be in reply
 *   - string literal   → prefix match (startsWith)
 *   - number literal   → strict equality
 */
function compareAttribute(
  name: string,
  expected: string | number,
  actual: string | number | undefined,
): AttributeFailure | null {
  if (typeof expected === "string" && expected.toLowerCase() === "not-exist") {
    if (actual !== undefined) {
      return { attribute: name, expected, actual, reason: "should_not_exist" };
    }
    return null;
  }
  if (actual === undefined) {
    return { attribute: name, expected, actual: undefined, reason: "missing" };
  }
  if (typeof expected === "string" && (expected === "any" || expected === "*")) {
    return null;
  }
  if (typeof expected === "number") {
    return actual === expected
      ? null
      : { attribute: name, expected, actual, reason: "mismatch" };
  }
  return String(actual).startsWith(String(expected))
    ? null
    : { attribute: name, expected, actual, reason: "mismatch" };
}

/** Execute a single test fixture: build request, send, compare reply. */
export async function runTestFixture(
  name: string,
  fixture: TestFixture,
): Promise<TestRunResult> {
  const started = performance.now();
  const attrs: AttributeTuple[] = Object.entries(fixture.radius.request).map(
    ([k, v]) => [k, v] as AttributeTuple,
  );

  const isAccounting = fixture.radius.expect.startsWith("Accounting");
  const isCoA = fixture.radius.expect.startsWith("CoA") || fixture.radius.expect.startsWith("Disconnect");

  // Choose request code based on expected reply
  let requestCode: string;
  if (fixture.radius.expect.startsWith("Access-")) requestCode = "Access-Request";
  else if (isAccounting) requestCode = "Accounting-Request";
  else if (isCoA && fixture.radius.expect.startsWith("CoA")) requestCode = "CoA-Request";
  else if (isCoA) requestCode = "Disconnect-Request";
  else requestCode = "Access-Request";

  // If User-Password present and code is Access-Request, ensure it's untouched (radius lib handles PAP encoding).
  // Some fixtures may include Message-Authenticator as an input hint; strip it.
  const filtered = attrs.filter(([k]) => k !== "Message-Authenticator");

  try {
    const { reply, latencyMs } = await sendRadiusPacket({
      code: requestCode,
      host: fixture.radius.server.host,
      port: fixture.radius.server.port,
      secret: fixture.radius.server.secret,
      attributes: filtered,
      timeoutMs: 5000,
      retries: 1,
      requestAuthenticator: requestCode === "Access-Request" ? randomBytes(16) : undefined,
    });

    const actualAttrs: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(reply.attributes)) {
      const norm = normalizeValue(v);
      if (norm !== undefined) actualAttrs[k] = norm;
    }

    const codeMatch = reply.code === fixture.radius.expect;
    const failures: AttributeFailure[] = [];
    if (codeMatch && fixture.radius.reply) {
      for (const [k, expected] of Object.entries(fixture.radius.reply)) {
        const failure = compareAttribute(k, expected, actualAttrs[k]);
        if (failure) failures.push(failure);
      }
    }

    return {
      name,
      expected: fixture.radius.expect,
      actual: reply.code,
      pass: codeMatch && failures.length === 0,
      durationMs: Math.round(latencyMs),
      attributeFailures: failures,
      attributesReceived: actualAttrs,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      name,
      expected: fixture.radius.expect,
      pass: false,
      durationMs: Math.round(performance.now() - started),
      error: msg,
      attributeFailures: [],
      attributesReceived: {},
    };
  }
}

export const __internal = { compareAttribute };
