import type { AttributeTuple } from "radius";

import type { LogBus } from "@/lib/jobs/logBus";
import { RadiusTimeoutError, sendRadiusPacket } from "@/lib/radius/client";
import { readServerById } from "@/lib/storage/yamlStore";
import type { CoAPacketProfile } from "@/lib/storage/schemas";

interface ResolvedTarget {
  host: string;
  port: number;
  secret: string;
  timeoutMs: number;
  retries: number;
}

async function resolveTarget(profile: CoAPacketProfile): Promise<ResolvedTarget> {
  const server = profile.target.server;
  if ("profile" in server) {
    const cfg = await readServerById(server.profile);
    if (!cfg) {
      throw new Error(`Server profile with id "${server.profile}" not found`);
    }
    return {
      host: cfg.host,
      port: cfg.coaPort,
      secret: cfg.secret,
      timeoutMs: cfg.timeoutMs,
      retries: cfg.retries,
    };
  }
  return {
    host: server.host,
    port: server.port,
    secret: server.secret,
    timeoutMs: server.timeoutMs,
    retries: server.retries,
  };
}

/**
 * Send a single CoA-Request or Disconnect-Request from a saved packet
 * profile, streaming tx/rx packet events through the job's LogBus. Throws
 * on timeout or resolution failure so the caller can transition the job
 * to `failed` with a readable error message.
 */
export async function runCoASend(profile: CoAPacketProfile, bus: LogBus): Promise<void> {
  const target = await resolveTarget(profile);
  const attributes: AttributeTuple[] = profile.attributes.map((a) => [a.name, a.value]);

  bus.info(`Sending ${profile.type} to ${target.host}:${target.port}`, {
    type: profile.type,
    target: { host: target.host, port: target.port },
    attributeCount: attributes.length,
  });

  try {
    const result = await sendRadiusPacket({
      code: profile.type,
      host: target.host,
      port: target.port,
      secret: target.secret,
      timeoutMs: target.timeoutMs,
      retries: target.retries,
      attributes,
      step: profile.type,
      onPacket: (pkt) => bus.log("info", `${pkt.direction.toUpperCase()} ${pkt.code}`, pkt),
    });

    bus.info(`Reply: ${result.reply.code}`, {
      replyCode: result.reply.code,
      latencyMs: Math.round(result.latencyMs),
      attempts: result.attempts,
    });
    bus.stats({
      replyCode: result.reply.code,
      latencyMs: Math.round(result.latencyMs),
      attempts: result.attempts,
      target: `${target.host}:${target.port}`,
    });
  } catch (err) {
    if (err instanceof RadiusTimeoutError) {
      bus.error(err.message, { attempts: err.attempts, latencyMs: Math.round(err.latencyMs) });
      bus.stats({
        replyCode: "timeout",
        latencyMs: Math.round(err.latencyMs),
        attempts: err.attempts,
        target: `${target.host}:${target.port}`,
      });
    } else {
      bus.error((err as Error).message);
    }
    throw err;
  }
}
