import { randomBytes } from "node:crypto";
import type { AttributeTuple } from "radius";

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

  const base = baseClientAttributes({
    serviceType: profile.session.serviceType,
    framedProtocol: profile.session.framedProtocol,
    nasIp: profile.nas.ip,
    nasPortId: profile.nas.portId,
    nasPortType: profile.nas.portType,
  });

  const sessionId = `sess-${randomBytes(8).toString("hex")}`;
  const framedIp = profile.session.framedIp ?? "10.0.0.1";

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
          ];
        })()
      : [
          ["User-Name", profile.user.username] as AttributeTuple,
          ["User-Password", profile.user.password] as AttributeTuple,
          ...base,
        ];

  transition("auth-sent");
  try {
    const authRes = await sendRadiusPacket({
      code: "Access-Request",
      host: server.host,
      port: server.authPort,
      secret,
      attributes: authAttrs,
      timeoutMs,
      retries,
    });
    outcome.packetsSent += 1;
    outcome.latencyMs.push(authRes.latencyMs);
    outcome.authCode = authRes.reply.code;
    events.onReply?.(authRes.reply.code, authRes.latencyMs);
    events.onLog?.(`auth reply ${authRes.reply.code}`, { identifier: authRes.reply.identifier });

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

  // --- Accounting-Start -----------------------------------------------------
  const acctBase: AttributeTuple[] = [
    ["User-Name", profile.user.username],
    ["Acct-Session-Id", sessionId],
    ["Acct-Authentic", profile.session.acctAuthentic],
    ["Framed-IP-Address", framedIp],
    ...base,
  ];

  transition("acct-start-sent");
  try {
    const res = await sendRadiusPacket({
      code: "Accounting-Request",
      host: server.host,
      port: server.acctPort,
      secret,
      attributes: [...acctBase, ["Acct-Status-Type", "Start"]],
      timeoutMs,
      retries,
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
  const deadline = Date.now() + profile.session.durationSeconds * 1000;
  let inputBytes = 0;
  let outputBytes = 0;
  let interimCount = 0;

  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    const tick = Math.min(profile.session.interimIntervalSeconds * 1000, remaining);
    await sleep(tick);

    if (events.shouldStop?.()) break;
    if (Date.now() >= deadline) break;

    inputBytes += randomInRange(
      profile.traffic.inputBytesPerInterval[0],
      profile.traffic.inputBytesPerInterval[1],
    );
    outputBytes += randomInRange(
      profile.traffic.outputBytesPerInterval[0],
      profile.traffic.outputBytesPerInterval[1],
    );
    interimCount += 1;

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
          ["Acct-Session-Time", Math.round((Date.now() - (deadline - profile.session.durationSeconds * 1000)) / 1000)],
        ],
        timeoutMs,
        retries,
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
        ["Acct-Session-Time", profile.session.durationSeconds],
        ["Acct-Terminate-Cause", "User-Request"],
      ],
      timeoutMs,
      retries,
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
