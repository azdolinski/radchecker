"use client";

import { useCallback, useEffect, useState } from "react";
import { User } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { ListBlock } from "@/components/profiles/list-block";
import { ProfileFormSheet, type ProfileSheetState } from "@/components/profiles/profile-form-sheet";
import type { ClientProfile } from "@/lib/storage/schemas";
import { nextFreeName } from "@/lib/storage/nextFreeName";
import { randomId } from "@/lib/utils";

export function ClientProfilesConsole() {
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState<ProfileSheetState | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = (await fetch("/api/profiles").then((r) => r.json())) as {
        profiles?: ClientProfile[];
      };
      setClients(p.profiles ?? []);
    } catch (err) {
      toast.error(`Load failed: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const deleteClient = async (name: string) => {
    if (!confirm(`Delete client profile "${name}"?`)) return;
    const res = await fetch(`/api/profiles/${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Delete failed");
      return;
    }
    toast.success(`Deleted ${name}`);
    void load();
  };

  const duplicateClient = (name: string) => {
    const source = clients.find((c) => c.name === name);
    if (!source) return;
    const taken = new Set(clients.map((c) => c.name));
    const seed: ClientProfile = {
      ...structuredClone(source),
      id: randomId(),
      name: nextFreeName(source.name, taken),
    };
    setSheet({ kind: "client", mode: "new", seed });
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Radius clients</h1>
          <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
            Client emulator profiles — user credentials, NAS attributes and
            session/accounting parameters. Stored as YAML under{" "}
            <code className="rounded bg-[color:var(--color-muted)] px-1 py-0.5 font-mono text-[11px]">
              data/profiles/clients.yaml
            </code>
            .
          </p>
        </div>
        <Badge tone="primary">{clients.length} total</Badge>
      </header>

      <div className="min-h-0 flex-1">
        <ListBlock<ClientProfile>
          kind="clients"
          title="Client profiles"
          subtitle="User credentials, NAS, session and accounting parameters."
          icon={User}
          items={clients}
          loading={loading}
          onRefresh={() => void load()}
          onEdit={(name) => setSheet({ kind: "client", mode: "edit", name })}
          onNew={() => setSheet({ kind: "client", mode: "new" })}
          onDelete={deleteClient}
          onDuplicate={duplicateClient}
          renderMeta={(p) => (
            <>
              <span>{p.user.username}</span>
              <span className="mx-1 opacity-40">·</span>
              <span>NAS {p.nas.ip}</span>
              <span className="mx-1 opacity-40">·</span>
              <span>
                {p.session.durationSeconds}s · interim {p.session.interimIntervalSeconds}s
              </span>
            </>
          )}
        />
      </div>

      <ProfileFormSheet
        state={sheet}
        onClose={() => setSheet(null)}
        onSaved={() => {
          setSheet(null);
          void load();
        }}
      />
    </div>
  );
}
