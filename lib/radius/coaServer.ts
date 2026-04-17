import dgram from "node:dgram";
import radius from "radius";

import type { LogBus } from "@/lib/jobs/logBus";
import type { CoAConfig } from "@/lib/storage/schemas";

type Direction = "RECV" | "SEND";

export interface PacketLog {
  direction: Direction;
  ts: number;
  remote: string;
  code: string;
  identifier: number;
  length: number;
  authenticator: string;
  attributes: Record<string, string | number | string[]>;
  messageAuthenticatorValid?: boolean;
}

export interface CoAServerStats {
  received: number;
  sent: number;
  byCode: Record<string, number>;
  errors: number;
  startedAt: number;
  listeningOn?: string;
}

/** Stringify attributes map (flatten Buffers and arrays) for readable log. */
function normalizeAttrs(
  raw: Record<string, string | number | Buffer | Array<string | number | Buffer>>,
): Record<string, string | number | string[]> {
  const out: Record<string, string | number | string[]> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (Array.isArray(v)) {
      out[k] = v.map((x) => (Buffer.isBuffer(x) ? x.toString("hex") : String(x)));
    } else if (Buffer.isBuffer(v)) {
      out[k] = v.toString("hex");
    } else {
      out[k] = v as string | number;
    }
  }
  return out;
}

/** Map incoming request code → response code based on policy. */
function responseCode(requestCode: string, policy: CoAConfig["policy"]): string | null {
  const accept = policy === "always-ack" || (policy === "random" && Math.random() > 0.3);
  if (requestCode === "Disconnect-Request") return accept ? "Disconnect-ACK" : "Disconnect-NAK";
  if (requestCode === "CoA-Request") return accept ? "CoA-ACK" : "CoA-NAK";
  return null;
}

export interface StartedCoAServer {
  stop: () => Promise<void>;
  stats: CoAServerStats;
}

/**
 * Start a UDP listener that decodes incoming CoA/Disconnect requests
 * and responds per policy. Emits structured logs to the provided LogBus.
 */
export async function startCoAServer(
  cfg: CoAConfig,
  bus: LogBus,
): Promise<StartedCoAServer> {
  const socket = dgram.createSocket({ type: "udp4", reuseAddr: false });
  const stats: CoAServerStats = {
    received: 0,
    sent: 0,
    byCode: {},
    errors: 0,
    startedAt: Date.now(),
  };

  const pushStats = () => bus.stats({ ...stats });

  socket.on("message", (msg, rinfo) => {
    const remote = `${rinfo.address}:${rinfo.port}`;
    let decoded: ReturnType<typeof radius.decode>;
    try {
      decoded = radius.decode({ packet: msg, secret: cfg.secret });
    } catch (err) {
      stats.errors += 1;
      bus.error(`decode failed from ${remote}: ${(err as Error).message}`, {
        remote,
        bytes: msg.length,
      });
      pushStats();
      return;
    }

    const recvLog: PacketLog = {
      direction: "RECV",
      ts: Date.now(),
      remote,
      code: decoded.code,
      identifier: decoded.identifier,
      length: decoded.length,
      authenticator: decoded.authenticator.toString("hex"),
      attributes: normalizeAttrs(decoded.attributes),
    };
    stats.received += 1;
    stats.byCode[decoded.code] = (stats.byCode[decoded.code] ?? 0) + 1;
    bus.info(`[RECV] ${decoded.code} id=${decoded.identifier} from ${remote}`, recvLog);

    const outCode = responseCode(decoded.code, cfg.policy);
    if (!outCode) {
      bus.warn(`unsupported request code ${decoded.code}, ignoring`, { remote });
      pushStats();
      return;
    }

    let response: Buffer;
    try {
      response = radius.encode_response({
        packet: decoded,
        code: outCode,
        secret: cfg.secret,
      });
    } catch (err) {
      stats.errors += 1;
      bus.error(`encode_response failed: ${(err as Error).message}`);
      pushStats();
      return;
    }

    socket.send(response, rinfo.port, rinfo.address, (err) => {
      if (err) {
        stats.errors += 1;
        bus.error(`send failed: ${err.message}`);
        pushStats();
        return;
      }
      stats.sent += 1;
      stats.byCode[outCode] = (stats.byCode[outCode] ?? 0) + 1;
      const sendLog: PacketLog = {
        direction: "SEND",
        ts: Date.now(),
        remote,
        code: outCode,
        identifier: decoded.identifier,
        length: response.length,
        authenticator: response.subarray(4, 20).toString("hex"),
        attributes: {},
      };
      bus.info(`[SEND] ${outCode} id=${decoded.identifier} to ${remote}`, sendLog);
      pushStats();
    });
  });

  socket.on("error", (err) => {
    bus.error(`socket error: ${err.message}`);
    stats.errors += 1;
    pushStats();
  });

  await new Promise<void>((resolve, reject) => {
    socket.once("listening", () => {
      const addr = socket.address();
      stats.listeningOn = `${addr.address}:${addr.port}`;
      bus.info(`listening on ${stats.listeningOn}`);
      pushStats();
      resolve();
    });
    socket.once("error", reject);
    socket.bind(cfg.port, cfg.bind);
  });

  const stop = async () => {
    await new Promise<void>((resolve) => {
      socket.close(() => {
        bus.info("socket closed");
        resolve();
      });
    });
  };

  return { stop, stats };
}
