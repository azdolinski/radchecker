"use client";

import { Field, Section } from "@/components/ui/field";
import { ServerConfigSchema, type ServerConfig } from "@/lib/storage/schemas";

export interface ServerConfigFormProps {
  value: ServerConfig;
  onChange: (next: ServerConfig) => void;
  errors: Record<string, string>;
  mode: "new" | "edit";
}

export const DEFAULT_SERVER_CONFIG: ServerConfig = {
  name: "",
  host: "127.0.0.1",
  authPort: 1812,
  acctPort: 1813,
  secret: "testing123",
  timeoutMs: 5000,
  retries: 1,
};

export function validateServerConfig(v: ServerConfig): Record<string, string> {
  const r = ServerConfigSchema.safeParse(v);
  if (r.success) return {};
  const out: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const key = issue.path.join(".");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export function ServerConfigForm({ value, onChange, errors, mode }: ServerConfigFormProps) {
  const set = (patch: Partial<ServerConfig>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-6">
      <Section title="Identity">
        <Field
          id="name"
          label="Server name"
          required
          value={value.name}
          disabled={mode === "edit"}
          placeholder="e.g. default"
          hint={mode === "edit" ? "Name is immutable (delete and create new to rename)." : "Alphanumeric, dot, dash, underscore only"}
          onChange={(e) => set({ name: e.target.value })}
          error={errors["name"]}
        />
      </Section>

      <Section title="Connection" subtitle="RADIUS server host and ports">
        <Field
          id="host"
          label="Host"
          required
          value={value.host}
          onChange={(e) => set({ host: e.target.value })}
          error={errors["host"]}
          placeholder="127.0.0.1 or radius.example.com"
        />
        <div className="grid grid-cols-2 gap-3">
          <Field
            id="authPort"
            label="Auth port"
            type="number"
            min={1}
            max={65535}
            value={value.authPort}
            onChange={(e) => set({ authPort: Number(e.target.value) || 0 })}
            error={errors["authPort"]}
            hint="Standard: 1812"
          />
          <Field
            id="acctPort"
            label="Accounting port"
            type="number"
            min={1}
            max={65535}
            value={value.acctPort}
            onChange={(e) => set({ acctPort: Number(e.target.value) || 0 })}
            error={errors["acctPort"]}
            hint="Standard: 1813"
          />
        </div>
        <Field
          id="secret"
          label="Shared secret"
          required
          value={value.secret}
          onChange={(e) => set({ secret: e.target.value })}
          error={errors["secret"]}
          hint="Must match the secret configured in RADIUS server's clients.conf"
        />
      </Section>

      <Section title="Transport" subtitle="Timeouts and retransmissions">
        <div className="grid grid-cols-2 gap-3">
          <Field
            id="timeoutMs"
            label="Timeout"
            type="number"
            min={100}
            max={60000}
            value={value.timeoutMs}
            onChange={(e) => set({ timeoutMs: Number(e.target.value) || 0 })}
            suffix="ms"
            error={errors["timeoutMs"]}
            hint="100–60000 ms"
          />
          <Field
            id="retries"
            label="Retries"
            type="number"
            min={0}
            max={10}
            value={value.retries}
            onChange={(e) => set({ retries: Number(e.target.value) || 0 })}
            error={errors["retries"]}
            hint="Retransmissions after timeout (0–10)"
          />
        </div>
      </Section>
    </div>
  );
}
