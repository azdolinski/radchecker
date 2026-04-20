import { randomBytes } from "node:crypto";
import type { AttributeTuple } from "radius";

import type { PacketLog } from "@/lib/jobs/types";
import type { ClientProfile, ServerConfig } from "@/lib/storage/schemas";
import { encodeChap } from "./chap";
import { baseClientAttributes, buildServerTargets, sendRadiusPacket } from "./client";

export interface SessionOutcome {
  ok: boolean;
  authCode: string;
  packetsSent: number;
  latencyMs: number[]; // one entry per request/response round-trip
  error?: string;
  reason?: string;
}

export interface SessionEvents {
  onLog?: (message: string, data?: unknown) => void;
  onReply?: (code: string, latencyMs: number) => void;
  onStateChange?: (state: SessionState) => void;
  onPacket?: (packet: PacketLog) => void;
  shouldStop?: () => boolean;
}

export type SessionState =
  | "init"
  | "auth-sent"
  | "auth-accepted"
  | "auth-rejected"
  | "acct-start-sent"
  | "acct-interim"
  | "acct-stop-sent"
  | "completed"
  | "failed";

function randomInRange(min: number, max: number): number {
  if (max <= min) return min;
  return Math.floor(min + Math.random() * (max - min));
}

/**
 * Run one full client lifecycle:
 *   Access-Request → (on accept) Accounting-Start → Interim-Updates … → Accounting-Stop
 */
export async function runSession(
  profile: ClientProfile,
  server: ServerConfig,
  events: SessionEvents = {},
): Promise<SessionOutcome> {
  const { secret, timeoutMs, retries } = buildServerTargets(server);
  const outcome: SessionOutcome = { ok: false, authCode: "", packetsSent: 0, latencyMs: [] };
  const transition = (state: SessionState) => events.onStateChange?.(state);

  // User-supplied attributes from the profile, applied to both Access- and
  // Accounting-Request. Duplicate names (e.g. an attribute also emitted by
  // baseClientAttributes) are simply sent twice — acceptable for RADIUS.
  const extraAttrs: AttributeTuple[] = profile.session.attributes.map(
    (a) => [a.name, a.value] as AttributeTuple,
  );

  const base = baseClientAttributes({
    nasIp: profile.nas.ip,
    nasPortId: profile.nas.portId,
    nasPortType: profile.nas.portType,
  });

  const sessionId = `sess-${randomBytes(8).toString("hex")}`;
  const accountingOff = profile.accounting.disabled;

  // Step framing — matches the "=== Step N/Total: Label ===" format used by radtest.sh.
  // Total = Access-Request + Accounting-Start + (N interim updates) + Accounting-Stop,
  // or just Access-Request when accounting is disabled.
  const interval = accountingOff
    ? 0
    : Math.max(1, profile.accounting.interimIntervalSeconds);
  const estimatedInterims = accountingOff
    ? 0
    : Math.max(0, Math.floor(profile.accounting.durationSeconds / interval) - 1);
  const totalSteps = accountingOff ? 1 : 2 + estimatedInterims + 1;
  let stepNum = 0;
  const stepHeader = (label: string) =>
    events.onLog?.(`=== Step ${++stepNum}/${totalSteps}: ${label} ===`);

  // --- Access-Request -------------------------------------------------------
  const authAttrs: AttributeTuple[] =
    profile.user.authType === "chap"
      ? (() => {
          const chap = encodeChap(profile.user.password);
          return [
            ["User-Name", profile.user.username] as AttributeTuple,
            ["CHAP-Password", chap.password] as AttributeTuple,
            ["CHAP-Challenge", chap.challenge] as AttributeTuple,
            ...base,
            ...extraAttrs,
          ];
        })()
      : [
          ["User-Name", profile.user.username] as AttributeTuple,
          ["User-Password", profile.user.password] as AttributeTuple,
          ...base,
          ...extraAttrs,
        ];

  transition("auth-sent");
  stepHeader("Authentication");
  try {
    const authRes = await sendRadiusPacket({
      code: "Access-Request",
      host: server.host,
      port: server.authPort,
      secret,
      attributes: authAttrs,
      timeoutMs,
      retries,
      onPacket: events.onPacket,
      step: "Authentication",
    });
    outcome.packetsSent += 1;
    outcome.latencyMs.push(authRes.latencyMs);
    outcome.authCode = authRes.reply.code;
    events.onReply?.(authRes.reply.code, authRes.latencyMs);

    if (authRes.reply.code !== "Access-Accept") {
      transition("auth-rejected");
      outcome.reason = authRes.reply.code;
      outcome.ok = false;
      return outcome;
    }
    transition("auth-accepted");
  } catch (err) {
    transition("failed");
    outcome.error = (err as Error).message;
    return outcome;
  }

  if (accountingOff) {
    events.onLog?.("accounting disabled (interimIntervalSeconds = -1) — skipping Acct Start/Interim/Stop");
    transition("completed");
    outcome.ok = !outcome.error;
    return outcome;
  }

  // --- Accounting-Start -----------------------------------------------------
  const acctBase: AttributeTuple[] = [
    ["User-Name", profile.user.username],
    ["Acct-Session-Id", sessionId],
    ...base,
    ...extraAttrs,
  ];

  transition("acct-start-sent");
  stepHeader("Accounting-Start");
  try {
    const res = await sendRadiusPacket({
      code: "Accounting-Request",
      host: server.host,
      port: server.acctPort,
      secret,
      attributes: [...acctBase, ["Acct-Status-Type", "Start"]],
      timeoutMs,
      retries,
      onPacket: events.onPacket,
      step: "Accounting-Start",
    });
    outcome.packetsSent += 1;
    outcome.latencyMs.push(res.latencyMs);
    events.onReply?.(res.reply.code, res.latencyMs);
  } catch (err) {
    transition("failed");
    outcome.error = `acct-start: ${(err as Error).message}`;
    return outcome;
  }

  // --- Interim loop ---------------------------------------------------------
  transition("acct-interim");
  const deadline = Date.now() + profile.accounting.durationSeconds * 1000;
  let inputBytes = 0;
  let outputBytes = 0;
  let interimCount = 0;

  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    const tick = Math.min(profile.accounting.interimIntervalSeconds * 1000, remaining);
    await sleep(tick);

    if (events.shouldStop?.()) break;
    if (Date.now() >= deadline) break;

    inputBytes += randomInRange(
      profile.accounting.traffic.inputBytesPerInterval[0],
      profile.accounting.traffic.inputBytesPerInterval[1],
    );
    outputBytes += randomInRange(
      profile.accounting.traffic.outputBytesPerInterval[0],
      profile.accounting.traffic.outputBytesPerInterval[1],
    );
    interimCount += 1;

    const interimLabel = `Interim-Update #${interimCount}`;
    stepHeader(interimLabel);
    try {
      const res = await sendRadiusPacket({
        code: "Accounting-Request",
        host: server.host,
        port: server.acctPort,
        secret,
        attributes: [
          ...acctBase,
          ["Acct-Status-Type", "Interim-Update"],
          ["Acct-Input-Octets", inputBytes],
          ["Acct-Output-Octets", outputBytes],
          ["Acct-Session-Time", Math.round((Date.now() - (deadline - profile.accounting.durationSeconds * 1000)) / 1000)],
        ],
        timeoutMs,
        retries,
        onPacket: events.onPacket,
        step: interimLabel,
      });
      outcome.packetsSent += 1;
      outcome.latencyMs.push(res.latencyMs);
      events.onReply?.(res.reply.code, res.latencyMs);
    } catch (err) {
      events.onLog?.(`interim failed: ${(err as Error).message}`, { interimCount });
    }
  }

  // --- Accounting-Stop ------------------------------------------------------
  transition("acct-stop-sent");
  stepHeader("Accounting-Stop");
  try {
    const res = await sendRadiusPacket({
      code: "Accounting-Request",
      host: server.host,
      port: server.acctPort,
      secret,
      attributes: [
        ...acctBase,
        ["Acct-Status-Type", "Stop"],
        ["Acct-Input-Octets", inputBytes],
        ["Acct-Output-Octets", outputBytes],
        ["Acct-Session-Time", profile.accounting.durationSeconds],
        ["Acct-Terminate-Cause", "User-Request"],
      ],
      timeoutMs,
      retries,
      onPacket: events.onPacket,
      step: "Accounting-Stop",
    });
    outcome.packetsSent += 1;
    outcome.latencyMs.push(res.latencyMs);
    events.onReply?.(res.reply.code, res.latencyMs);
  } catch (err) {
    events.onLog?.(`acct-stop failed: ${(err as Error).message}`);
    outcome.error = `acct-stop: ${(err as Error).message}`;
  }

  transition("completed");
  outcome.ok = !outcome.error;
  return outcome;
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
