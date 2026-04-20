"use client";

import { AttributesEditor } from "@/components/coa-sender/attributes-editor";
import { Field, SelectField, Section } from "@/components/ui/field";
import { ClientProfileSchema, type ClientProfile } from "@/lib/storage/schemas";
import { cn, randomId } from "@/lib/utils";

export interface ClientProfileFormProps {
  value: ClientProfile;
  onChange: (next: ClientProfile) => void;
  errors: Record<string, string>;
  mode: "new" | "edit";
}

export function makeDefaultClientProfile(): ClientProfile {
  return {
    id: randomId(),
    name: "",
    user: { username: "", password: "", authType: "pap" },
    nas: { ip: "10.0.0.1", portId: "eth0", portType: "Ethernet" },
    session: {
      attributes: [
        { name: "Framed-IP-Address", value: "10.0.0.100" },
        { name: "Service-Type", value: "Framed-User" },
        { name: "Framed-Protocol", value: "PPP" },
        { name: "Acct-Authentic", value: "RADIUS" },
      ],
    },
    accounting: {
      disabled: false,
      durationSeconds: 60,
      interimIntervalSeconds: 10,
      traffic: {
        inputBytesPerInterval: [100_000, 500_000],
        outputBytesPerInterval: [1_000_000, 5_000_000],
      },
    },
  };
}

export function validateClientProfile(v: ClientProfile): Record<string, string> {
  const r = ClientProfileSchema.safeParse(v);
  if (r.success) return {};
  const out: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const key = issue.path.join(".");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export function ClientProfileForm({ value, onChange, errors, mode }: ClientProfileFormProps) {
  const set = <T,>(patch: Partial<ClientProfile> | ((prev: ClientProfile) => T)) => {
    if (typeof patch === "function") return;
    onChange({ ...value, ...patch });
  };
  const setUser = (patch: Partial<ClientProfile["user"]>) =>
    onChange({ ...value, user: { ...value.user, ...patch } });
  const setNas = (patch: Partial<ClientProfile["nas"]>) =>
    onChange({ ...value, nas: { ...value.nas, ...patch } });
  const setSession = (patch: Partial<ClientProfile["session"]>) =>
    onChange({ ...value, session: { ...value.session, ...patch } });
  const setAccounting = (patch: Partial<ClientProfile["accounting"]>) =>
    onChange({ ...value, accounting: { ...value.accounting, ...patch } });
  const setTrafficInput = (idx: 0 | 1, v: number) => {
    const next = [...value.accounting.traffic.inputBytesPerInterval] as [number, number];
    next[idx] = v;
    setAccounting({ traffic: { ...value.accounting.traffic, inputBytesPerInterval: next } });
  };
  const setTrafficOutput = (idx: 0 | 1, v: number) => {
    const next = [...value.accounting.traffic.outputBytesPerInterval] as [number, number];
    next[idx] = v;
    setAccounting({ traffic: { ...value.accounting.traffic, outputBytesPerInterval: next } });
  };

  return (
    <div className="space-y-6">
      <Section title="Identity" subtitle="Name becomes the YAML file name">
        <Field
          id="name"
          label="Profile name"
          required
          value={value.name}
          disabled={mode === "edit"}
          placeholder="e.g. azdolinski"
          hint={mode === "edit" ? "Name is immutable (delete and create new to rename)." : "Alphanumeric, dot, dash, underscore only"}
          onChange={(e) => set({ name: e.target.value })}
          error={errors["name"]}
        />
      </Section>

      <Section title="User" subtitle="Credentials sent in Access-Request">
        <div className="grid grid-cols-2 gap-3">
          <Field
            id="user.username"
            label="Username"
            required
            value={value.user.username}
            onChange={(e) => setUser({ username: e.target.value })}
            error={errors["user.username"]}
            placeholder="user@example.com"
          />
          <Field
            id="user.password"
            label="Password"
            required
            value={value.user.password}
            onChange={(e) => setUser({ password: e.target.value })}
            error={errors["user.password"]}
          />
        </div>
        <SelectField
          id="user.authType"
          label="Auth type"
          value={value.user.authType}
          options={[
            { value: "pap", label: "PAP (plain User-Password)" },
            { value: "chap", label: "CHAP (challenge/response)" },
          ]}
          onChange={(v) => setUser({ authType: v as "pap" | "chap" })}
        />
      </Section>

      <Section title="NAS" subtitle="Network Access Server identity attributes">
        <div className="grid grid-cols-3 gap-3">
          <Field
            id="nas.ip"
            label="NAS IP"
            required
            value={value.nas.ip}
            onChange={(e) => setNas({ ip: e.target.value })}
            error={errors["nas.ip"]}
            placeholder="10.0.0.1"
          />
          <Field
            id="nas.portId"
            label="Port ID"
            value={value.nas.portId}
            onChange={(e) => setNas({ portId: e.target.value })}
            placeholder="eth0/0/1"
          />
          <Field
            id="nas.portType"
            label="Port type"
            value={value.nas.portType}
            onChange={(e) => setNas({ portType: e.target.value })}
            placeholder="Ethernet"
          />
        </div>
      </Section>

      <Section
        title="Session"
        subtitle="Attributes added to every Access-Request and Accounting-Request"
      >
        <AttributesEditor
          value={value.session.attributes}
          onChange={(next) => setSession({ attributes: next })}
        />
      </Section>

      <Section
        title="Accounting"
        subtitle="Session duration, interim cadence, and random traffic reported in every Interim packet"
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium">Accounting</span>
          <button
            type="button"
            onClick={() => setAccounting({ disabled: !value.accounting.disabled })}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              value.accounting.disabled
                ? "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400"
                : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
            )}
          >
            {value.accounting.disabled ? "OFF" : "ON"}
          </button>
        </div>
        {value.accounting.disabled ? (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
            Accounting is <b>off</b>. The session will send <code>Access-Request</code>{" "}
            only — no Start / Interim / Stop packets, no traffic simulation.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field
                id="accounting.durationSeconds"
                label="Session duration"
                type="number"
                min={1}
                value={value.accounting.durationSeconds}
                onChange={(e) =>
                  setAccounting({ durationSeconds: Number(e.target.value) || 0 })
                }
                suffix="sec"
                error={errors["accounting.durationSeconds"]}
              />
              <Field
                id="accounting.interimIntervalSeconds"
                label="Interim interval"
                type="number"
                min={1}
                value={value.accounting.interimIntervalSeconds}
                onChange={(e) =>
                  setAccounting({ interimIntervalSeconds: Number(e.target.value) || 0 })
                }
                suffix="sec"
                hint="Cadence between Accounting-Interim-Update packets."
                error={errors["accounting.interimIntervalSeconds"]}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-[color:var(--color-muted-foreground)]">
                Acct-Input-Octets per interval
              </label>
              <div className="grid grid-cols-2 gap-3">
                <Field
                  id="accounting.traffic.inMin"
                  label="min"
                  type="number"
                  min={0}
                  value={value.accounting.traffic.inputBytesPerInterval[0]}
                  onChange={(e) => setTrafficInput(0, Number(e.target.value) || 0)}
                  suffix="B"
                />
                <Field
                  id="accounting.traffic.inMax"
                  label="max"
                  type="number"
                  min={0}
                  value={value.accounting.traffic.inputBytesPerInterval[1]}
                  onChange={(e) => setTrafficInput(1, Number(e.target.value) || 0)}
                  suffix="B"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-[color:var(--color-muted-foreground)]">
                Acct-Output-Octets per interval
              </label>
              <div className="grid grid-cols-2 gap-3">
                <Field
                  id="accounting.traffic.outMin"
                  label="min"
                  type="number"
                  min={0}
                  value={value.accounting.traffic.outputBytesPerInterval[0]}
                  onChange={(e) => setTrafficOutput(0, Number(e.target.value) || 0)}
                  suffix="B"
                />
                <Field
                  id="accounting.traffic.outMax"
                  label="max"
                  type="number"
                  min={0}
                  value={value.accounting.traffic.outputBytesPerInterval[1]}
                  onChange={(e) => setTrafficOutput(1, Number(e.target.value) || 0)}
                  suffix="B"
                />
              </div>
            </div>
          </>
        )}
      </Section>
    </div>
  );
}

