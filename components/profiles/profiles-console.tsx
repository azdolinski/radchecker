"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Copy,
  Globe,
  Pencil,
  Plus,
  RefreshCw,
  Server,
  Trash2,
  User,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileFormSheet, type ProfileSheetState } from "@/components/profiles/profile-form-sheet";
import type { ClientProfile, ServerConfig } from "@/lib/storage/schemas";
import { nextFreeName } from "@/lib/storage/nextFreeName";
import { cn } from "@/lib/utils";

type Kind = "client" | "servers";

interface ListBlockProps<T extends { name: string }> {
  kind: Kind;
  title: string;
  subtitle: string;
  icon: typeof User;
  items: T[];
  onRefresh: () => void;
  onEdit: (name: string) => void;
  onNew: () => void;
  onDelete: (name: string) => Promise<void>;
  onDuplicate: (name: string) => void;
  renderMeta: (item: T) => React.ReactNode;
  loading: boolean;
}

function ListBlock<T extends { name: string }>({
  kind,
  title,
  subtitle,
  icon: Icon,
  items,
  onRefresh,
  onEdit,
  onNew,
  onDelete,
  onDuplicate,
  renderMeta,
  loading,
}: ListBlockProps<T>) {
  return (
    <Card className="flex min-h-0 flex-col">
      <CardHeader className="flex-row items-start justify-between gap-4 py-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[color:var(--color-primary)]/10 text-[color:var(--color-primary)]">
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="flex items-center gap-2">
              {title}
              <Badge tone="neutral">{items.length}</Badge>
            </CardTitle>
            <p className="mt-0.5 text-[11px] text-[color:var(--color-muted-foreground)]">
              {subtitle}
            </p>
            <p className="mt-0.5 font-mono text-[10px] text-[color:var(--color-muted-foreground)]/80">
              data/profiles/{kind}/
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={onRefresh} title="Refresh">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" onClick={onNew}>
            <Plus className="h-3.5 w-3.5" />
            New
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-1.5 pt-0">
        {loading ? (
          <div className="rounded-md border border-dashed border-[color:var(--color-border)] p-6 text-center text-xs text-[color:var(--color-muted-foreground)]">
            Loading…
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-md border border-dashed border-[color:var(--color-border)] p-6 text-center">
            <p className="text-xs font-medium">No entries</p>
            <p className="mt-1 text-[11px] text-[color:var(--color-muted-foreground)]">
              Click <span className="font-medium">New</span> to create a new {title.toLowerCase()}.
            </p>
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.name}
              className={cn(
                "group flex items-center gap-3 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-background)] px-3 py-2.5 transition-colors",
                "hover:border-[color:var(--color-primary)]/40",
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-xs font-medium">{item.name}</div>
                <div className="mt-0.5 truncate text-[11px] text-[color:var(--color-muted-foreground)]">
                  {renderMeta(item)}
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-70 transition-opacity group-hover:opacity-100">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => onDuplicate(item.name)}
                  title="Duplicate"
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => onEdit(item.name)}
                  title="Edit YAML"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => void onDelete(item.name)}
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5 text-red-500/70 hover:text-red-500" />
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export function ProfilesConsole() {
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [servers, setServers] = useState<ServerConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState<ProfileSheetState | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, s] = await Promise.all([
        fetch("/api/profiles").then((r) => r.json() as Promise<{ profiles?: ClientProfile[] }>),
        fetch("/api/servers").then((r) => r.json() as Promise<{ servers?: ServerConfig[] }>),
      ]);
      setClients(p.profiles ?? []);
      setServers(s.servers ?? []);
    } catch (err) {
      toast.error(`Load failed: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totalEntries = useMemo(() => clients.length + servers.length, [clients, servers]);

  const deleteClient = async (name: string) => {
    if (!confirm(`Delete profile "${name}"?`)) return;
    const res = await fetch(`/api/data/file?path=profiles/client/${encodeURIComponent(name)}.yaml`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Delete failed");
      return;
    }
    toast.success(`Deleted ${name}`);
    void load();
  };

  const deleteServer = async (name: string) => {
    if (!confirm(`Delete server "${name}"?`)) return;
    const res = await fetch(`/api/data/file?path=profiles/servers/${encodeURIComponent(name)}.yaml`, {
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
      name: nextFreeName(source.name, taken),
    };
    setSheet({ kind: "client", mode: "new", seed });
  };

  const duplicateServer = (name: string) => {
    const source = servers.find((s) => s.name === name);
    if (!source) return;
    const taken = new Set(servers.map((s) => s.name));
    const seed: ServerConfig = {
      ...structuredClone(source),
      name: nextFreeName(source.name, taken),
    };
    setSheet({ kind: "server", mode: "new", seed });
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Profiles</h1>
          <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
            Client profiles + Server configs — both kinds in one place. Used by the
            Client Emulator. Stored as YAML under <code className="rounded bg-[color:var(--color-muted)] px-1 py-0.5 font-mono text-[11px]">data/profiles/</code>.
          </p>
        </div>
        <Badge tone="primary">{totalEntries} total</Badge>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
        <ListBlock<ClientProfile>
          kind="client"
          title="Client profiles"
          subtitle="User profile, NAS, session and accounting parameters."
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
        <ListBlock<ServerConfig>
          kind="servers"
          title="Server configs"
          subtitle="RADIUS targets — host, auth/acct ports, shared secret."
          icon={Server}
          items={servers}
          loading={loading}
          onRefresh={() => void load()}
          onEdit={(name) => setSheet({ kind: "server", mode: "edit", name })}
          onNew={() => setSheet({ kind: "server", mode: "new" })}
          onDelete={deleteServer}
          onDuplicate={duplicateServer}
          renderMeta={(s) => (
            <>
              <Globe className="inline h-3 w-3 opacity-60" />{" "}
              <span className="font-mono">
                {s.host}:{s.authPort}
              </span>
              <span className="mx-1 opacity-40">·</span>
              <span>acct :{s.acctPort}</span>
              <span className="mx-1 opacity-40">·</span>
              <span>{s.timeoutMs}ms timeout</span>
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
