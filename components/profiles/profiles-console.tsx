"use client";

import { useCallback, useEffect, useState } from "react";
import { Globe, Server, Star } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListBlock } from "@/components/profiles/list-block";
import { ProfileFormSheet, type ProfileSheetState } from "@/components/profiles/profile-form-sheet";
import type { ServerConfig } from "@/lib/storage/schemas";
import { nextFreeName } from "@/lib/storage/nextFreeName";
import { cn, randomId } from "@/lib/utils";

export function ProfilesConsole() {
  const [servers, setServers] = useState<ServerConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState<ProfileSheetState | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = (await fetch("/api/servers").then((r) => r.json())) as {
        servers?: ServerConfig[];
      };
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

  const deleteServer = async (name: string) => {
    if (!confirm(`Delete server "${name}"?`)) return;
    const res = await fetch(`/api/servers/${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Delete failed");
      return;
    }
    toast.success(`Deleted ${name}`);
    void load();
  };

  const duplicateServer = (name: string) => {
    const source = servers.find((s) => s.name === name);
    if (!source) return;
    const taken = new Set(servers.map((s) => s.name));
    const seed: ServerConfig = {
      ...structuredClone(source),
      id: randomId(),
      name: nextFreeName(source.name, taken),
      isFavorite: false,
    };
    setSheet({ kind: "server", mode: "new", seed });
  };

  const toggleFavorite = async (server: ServerConfig) => {
    const res = await fetch(`/api/servers/${encodeURIComponent(server.name)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...server, isFavorite: !server.isFavorite }),
    });
    if (!res.ok) {
      toast.error("Favorite update failed");
      return;
    }
    void load();
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Radius servers</h1>
          <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
            RADIUS targets used by the Client Emulator, CoA Sender and test runner.
            Stored as YAML under{" "}
            <code className="rounded bg-[color:var(--color-muted)] px-1 py-0.5 font-mono text-[11px]">
              data/profiles/servers.yaml
            </code>
            .
          </p>
        </div>
        <Badge tone="primary">{servers.length} total</Badge>
      </header>

      <div className="min-h-0 flex-1">
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
          renderLeading={(s) => (
            <Button
              size="icon"
              variant="ghost"
              onClick={() => void toggleFavorite(s)}
              title={s.isFavorite ? "Unfavorite" : "Mark as favorite"}
              className="h-7 w-7 shrink-0"
            >
              <Star
                className={cn(
                  "h-3.5 w-3.5 transition-colors",
                  s.isFavorite
                    ? "fill-amber-400 text-amber-500"
                    : "text-[color:var(--color-muted-foreground)]/60 hover:text-amber-500",
                )}
              />
            </Button>
          )}
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
