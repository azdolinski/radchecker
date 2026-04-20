import { z } from "zod";

/** Name used as YAML filename (kebab-case, no extension). */
export const NameSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-zA-Z0-9._-]+$/, "Must be alphanumeric, dot, dash, or underscore");

/**
 * Stable UUID identity for profile-class entities (Server, Client, CoA
 * server-sim config, CoA packet). References between profiles use this id,
 * not the name — so renames never break cross-references.
 */
export const IdSchema = z.uuid();

/** Element of data/profiles/servers.yaml — one RADIUS server target. */
export const ServerConfigSchema = z.object({
  id: IdSchema,
  name: NameSchema,
  host: z.string().min(1),
  authPort: z.number().int().min(1).max(65535).default(1812),
  acctPort: z.number().int().min(1).max(65535).default(1813),
  coaPort: z.number().int().min(1).max(65535).default(3799),
  secret: z.string().min(1),
  timeoutMs: z.number().int().min(100).max(60000).default(5000),
  retries: z.number().int().min(0).max(10).default(1),
  isFavorite: z.boolean().default(false),
});
export type ServerConfig = z.infer<typeof ServerConfigSchema>;

/** Element of data/profiles/coa_server.yaml — one CoA server simulator preset. */
export const CoAPolicySchema = z.enum(["always-ack", "always-nak", "random"]);
export const CoAConfigSchema = z.object({
  id: IdSchema,
  name: NameSchema,
  bind: z.string().default("0.0.0.0"),
  port: z.number().int().min(1).max(65535).default(3799),
  secret: z.string().min(1),
  policy: CoAPolicySchema.default("always-ack"),
});
export type CoAConfig = z.infer<typeof CoAConfigSchema>;

/** Element of data/profiles/clients.yaml — one client emulator profile. */
const RangeSchema = z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]);

export const ClientProfileSchema = z.object({
  id: IdSchema,
  name: NameSchema,
  user: z.object({
    username: z.string().min(1),
    password: z.string().min(1),
    authType: z.enum(["pap", "chap"]).default("pap"),
  }),
  nas: z.object({
    ip: z.string().min(1),
    portId: z.string().default("eth0"),
    portType: z.string().default("Ethernet"),
  }),
  session: z.object({
    framedIp: z.string().optional(),
    serviceType: z.string().default("Framed-User"),
    framedProtocol: z.string().default("PPP"),
    acctAuthentic: z.string().default("RADIUS"),
    durationSeconds: z.number().int().positive().default(60),
    interimIntervalSeconds: z.number().int().positive().default(10),
  }),
  traffic: z
    .object({
      inputBytesPerInterval: RangeSchema.default([100_000, 500_000]),
      outputBytesPerInterval: RangeSchema.default([1_000_000, 5_000_000]),
    })
    .default({
      inputBytesPerInterval: [100_000, 500_000],
      outputBytesPerInterval: [1_000_000, 5_000_000],
    }),
});
export type ClientProfile = z.infer<typeof ClientProfileSchema>;

/**
 * data/tests/<name>.yaml — test fixture (compatible with tmp/tests/data/*.yaml).
 *
 * Keeps existing structure (`test.*`, `radius.*`, `api.*`) but `api.*` is IGNORED
 * by v1 runner (see plan §Feature 3). Kept so that legacy files roundtrip.
 */
export const AttributeMapSchema = z.record(z.string(), z.union([z.string(), z.number()]));

export const ExpectCodeSchema = z.enum([
  "Access-Accept",
  "Access-Reject",
  "Access-Challenge",
  "Accounting-Response",
  "CoA-ACK",
  "CoA-NAK",
  "Disconnect-ACK",
  "Disconnect-NAK",
]);

export const TestFixtureSchema = z.object({
  test: z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }),
  api: z
    .object({
      pre_cleanup: z.boolean().optional(),
      cleanup: z.boolean().optional(),
      setup: z
        .object({
          users: z
            .array(
              z.object({
                username: z.string(),
                check_attrs: z
                  .array(
                    z.object({
                      attribute: z.string(),
                      op: z.string(),
                      value: z.union([z.string(), z.number()]),
                    }),
                  )
                  .optional(),
                reply_attrs: z
                  .array(
                    z.object({
                      attribute: z.string(),
                      op: z.string(),
                      value: z.union([z.string(), z.number()]),
                    }),
                  )
                  .optional(),
              }),
            )
            .optional(),
          huntgroups: z.array(z.unknown()).optional(),
        })
        .optional(),
    })
    .optional()
    .describe("API provisioning section — IGNORED by v1 runner"),
  radius: z.object({
    server: z.object({
      host: z.string(),
      port: z.number().int().min(1).max(65535),
      secret: z.string(),
    }),
    request: AttributeMapSchema,
    reply: AttributeMapSchema.optional(),
    expect: ExpectCodeSchema,
  }),
});
export type TestFixture = z.infer<typeof TestFixtureSchema>;

/** Element of data/profiles/coa_sender.yaml — one CoA packet profile used by CoA Sender. */
export const AttributePairSchema = z.object({
  name: z.string().min(1),
  value: z.union([z.string(), z.number()]),
});
export type AttributePair = z.infer<typeof AttributePairSchema>;

export const CoAPacketTypeSchema = z.enum(["CoA-Request", "Disconnect-Request"]);
export type CoAPacketType = z.infer<typeof CoAPacketTypeSchema>;

/** Inside `target.server`: either a profile reference or a full inline spec. */
export const ServerRefSchema = z.strictObject({ profile: IdSchema });
export const ServerInlineSchema = z.strictObject({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  secret: z.string().min(1),
  timeoutMs: z.number().int().min(100).max(60000).default(5000),
  retries: z.number().int().min(0).max(10).default(1),
});
export const CoAServerTargetSchema = z.union([ServerRefSchema, ServerInlineSchema]);
export type CoAServerTarget = z.infer<typeof CoAServerTargetSchema>;

/** Outer `target` object — single `server` key for now, room to grow later. */
export const CoATargetSchema = z.object({ server: CoAServerTargetSchema });
export type CoATarget = z.infer<typeof CoATargetSchema>;

export const CoAPacketProfileSchema = z.object({
  id: IdSchema,
  name: NameSchema,
  type: CoAPacketTypeSchema,
  target: CoATargetSchema,
  attributes: z.array(AttributePairSchema).default([]),
});
export type CoAPacketProfile = z.infer<typeof CoAPacketProfileSchema>;

/**
 * Enforce unique `id` and `name` across the collection. Emitted as Zod issues
 * so validation failure messages flow through parseWith() like any other.
 */
function checkUnique<T extends { id: string; name: string }>(
  list: T[],
  ctx: z.RefinementCtx,
  key: string,
) {
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  list.forEach((entry, index) => {
    if (seenIds.has(entry.id)) {
      ctx.addIssue({
        code: "custom",
        path: [key, index, "id"],
        message: `duplicate id in ${key}: ${entry.id}`,
      });
    }
    if (seenNames.has(entry.name)) {
      ctx.addIssue({
        code: "custom",
        path: [key, index, "name"],
        message: `duplicate name in ${key}: ${entry.name}`,
      });
    }
    seenIds.add(entry.id);
    seenNames.add(entry.name);
  });
}

/** data/profiles/clients.yaml — collection of client emulator profiles. */
export const ClientsFileSchema = z
  .object({ clients: z.array(ClientProfileSchema).default([]) })
  .superRefine((value, ctx) => checkUnique(value.clients, ctx, "clients"));
export type ClientsFile = z.infer<typeof ClientsFileSchema>;

/** data/profiles/servers.yaml — collection of RADIUS server targets. */
export const ServersFileSchema = z
  .object({ servers: z.array(ServerConfigSchema).default([]) })
  .superRefine((value, ctx) => checkUnique(value.servers, ctx, "servers"));
export type ServersFile = z.infer<typeof ServersFileSchema>;

/** data/profiles/coa_sender.yaml — collection of CoA sender packet profiles. */
export const CoASenderFileSchema = z
  .object({ coa_sender: z.array(CoAPacketProfileSchema).default([]) })
  .superRefine((value, ctx) => checkUnique(value.coa_sender, ctx, "coa_sender"));
export type CoASenderFile = z.infer<typeof CoASenderFileSchema>;

/** data/profiles/coa_server.yaml — collection of CoA server simulator presets. */
export const CoAServerFileSchema = z
  .object({ coa_server: z.array(CoAConfigSchema).default([]) })
  .superRefine((value, ctx) => checkUnique(value.coa_server, ctx, "coa_server"));
export type CoAServerFile = z.infer<typeof CoAServerFileSchema>;

/** Keys of the four top-level profile files under `data/profiles/`. */
export type ProfileFileKind = "clients" | "servers" | "coa_sender" | "coa_server";
