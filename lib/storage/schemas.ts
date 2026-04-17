import { z } from "zod";

/** Name used as YAML filename (kebab-case, no extension). */
export const NameSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-zA-Z0-9._-]+$/, "Must be alphanumeric, dot, dash, or underscore");

/** data/servers/<name>.yaml — RADIUS server target for client emulator & test runner. */
export const ServerConfigSchema = z.object({
  name: NameSchema,
  host: z.string().min(1),
  authPort: z.number().int().min(1).max(65535).default(1812),
  acctPort: z.number().int().min(1).max(65535).default(1813),
  secret: z.string().min(1),
  timeoutMs: z.number().int().min(100).max(60000).default(5000),
  retries: z.number().int().min(0).max(10).default(1),
});
export type ServerConfig = z.infer<typeof ServerConfigSchema>;

/** data/coa/<name>.yaml — CoA server simulator config. */
export const CoAPolicySchema = z.enum(["always-ack", "always-nak", "random"]);
export const CoAConfigSchema = z.object({
  name: NameSchema,
  bind: z.string().default("0.0.0.0"),
  port: z.number().int().min(1).max(65535).default(3799),
  secret: z.string().min(1),
  policy: CoAPolicySchema.default("always-ack"),
});
export type CoAConfig = z.infer<typeof CoAConfigSchema>;

/** data/profiles/<name>.yaml — client emulator profile. */
const RangeSchema = z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]);

export const ClientProfileSchema = z.object({
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

/** Matches directory layout under `data/`. See lib/storage/fsPaths.ts. */
export type EntityKind = "profiles/client" | "profiles/servers" | "coa" | "tests";

export const SchemaByKind = {
  "profiles/client": ClientProfileSchema,
  "profiles/servers": ServerConfigSchema,
  coa: CoAConfigSchema,
  tests: TestFixtureSchema,
} as const;
