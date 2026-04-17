import dgram from "node:dgram";
import { randomBytes } from "node:crypto";
import radius, { type AttributeTuple, type DecodedPacket } from "radius";

import type { ServerConfig } from "@/lib/storage/schemas";

export interface SendOptions {
  port: number; // auth or acct port
  code: string; // RADIUS packet code
  secret: string;
  host: string;
  attributes: AttributeTuple[];
  /** Required for Access-Request (RFC 2865 §3). */
  requestAuthenticator?: Buffer;
  /** Max wait for reply. */
  timeoutMs: number;
  /** Retransmits including initial. */
  retries: number;
  /** Optional identifier (usually assigned by socket). */
  identifier?: number;
}

export interface SendResult {
  reply: DecodedPacket;
  latencyMs: number;
  attempts: number;
}

let nextId = 0;
function nextIdentifier() {
  nextId = (nextId + 1) & 0xff;
  return nextId;
}

/**
 * Send a RADIUS packet on a fresh socket, await the matching reply, return
 * decoded response + latency. Retransmits on timeout up to `retries` times.
 */
export async function sendRadiusPacket(opts: SendOptions): Promise<SendResult> {
  const identifier = opts.identifier ?? nextIdentifier();
  const authenticator =
    opts.requestAuthenticator ?? (opts.code === "Access-Request" ? randomBytes(16) : undefined);

  const packet = radius.encode({
    code: opts.code,
    identifier,
    secret: opts.secret,
    attributes: opts.attributes,
    authenticator,
  });

  const socket = dgram.createSocket("udp4");
  let attempts = 0;
  const started = performance.now();

  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("error", reject);
      socket.bind(0, () => resolve());
    });

    for (let attempt = 0; attempt <= opts.retries; attempt++) {
      attempts = attempt + 1;
      const sentAt = performance.now();

      await new Promise<void>((resolve, reject) => {
        socket.send(packet, opts.port, opts.host, (err) => (err ? reject(err) : resolve()));
      });

      const reply = await new Promise<DecodedPacket | null>((resolve) => {
        const timer = setTimeout(() => {
          socket.removeListener("message", handler);
          resolve(null);
        }, opts.timeoutMs);

        const handler = (msg: Buffer) => {
          try {
            const decoded = radius.decode({ packet: msg, secret: opts.secret });
            if (decoded.identifier === identifier) {
              clearTimeout(timer);
              socket.removeListener("message", handler);
              resolve(decoded);
            }
          } catch {
            /* ignore malformed / mismatched packet */
          }
        };
        socket.on("message", handler);
      });

      if (reply) {
        const latencyMs = performance.now() - sentAt;
        return { reply, latencyMs, attempts };
      }
    }
    const latencyMs = performance.now() - started;
    throw new RadiusTimeoutError(`timeout after ${attempts} attempts`, { latencyMs, attempts });
  } finally {
    socket.close();
  }
}

export class RadiusTimeoutError extends Error {
  latencyMs: number;
  attempts: number;
  constructor(message: string, info: { latencyMs: number; attempts: number }) {
    super(message);
    this.name = "RadiusTimeoutError";
    this.latencyMs = info.latencyMs;
    this.attempts = info.attempts;
  }
}

/** Default attributes shared by both auth and accounting for a client. */
export function baseClientAttributes(params: {
  serviceType?: string;
  framedProtocol?: string;
  nasIp: string;
  nasPortId?: string;
  nasPortType?: string;
}): AttributeTuple[] {
  const out: AttributeTuple[] = [];
  if (params.serviceType) out.push(["Service-Type", params.serviceType]);
  if (params.framedProtocol) out.push(["Framed-Protocol", params.framedProtocol]);
  out.push(["NAS-IP-Address", params.nasIp]);
  if (params.nasPortType) out.push(["NAS-Port-Type", params.nasPortType]);
  if (params.nasPortId) out.push(["NAS-Port-Id", params.nasPortId]);
  return out;
}

export function buildServerTargets(server: ServerConfig) {
  return {
    authUrl: { host: server.host, port: server.authPort },
    acctUrl: { host: server.host, port: server.acctPort },
    secret: server.secret,
    timeoutMs: server.timeoutMs,
    retries: server.retries,
  };
}
