"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ClientProfileForm, DEFAULT_CLIENT_PROFILE, validateClientProfile } from "./client-profile-form";
import { DEFAULT_SERVER_CONFIG, ServerConfigForm, validateServerConfig } from "./server-config-form";
import type { ClientProfile, ServerConfig } from "@/lib/storage/schemas";

export type ProfileSheetState =
  | { kind: "client"; mode: "new"; seed?: ClientProfile }
  | { kind: "client"; mode: "edit"; name: string }
  | { kind: "server"; mode: "new"; seed?: ServerConfig }
  | { kind: "server"; mode: "edit"; name: string };

interface Props {
  state: ProfileSheetState | null;
  onClose: () => void;
  onSaved: () => void;
}

const LABEL = { client: "Client profile", server: "Server config" };
const API_LIST = { client: "/api/profiles", server: "/api/servers" };
const API_ITEM = {
  client: (name: string) => `/api/profiles/${encodeURIComponent(name)}`,
  server: (name: string) => `/api/servers/${encodeURIComponent(name)}`,
};

export function ProfileFormSheet({ state, onClose, onSaved }: Props) {
  const [client, setClient] = useState<ClientProfile>(DEFAULT_CLIENT_PROFILE);
  const [server, setServer] = useState<ServerConfig>(DEFAULT_SERVER_CONFIG);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!state) return;
    setErrors({});
    if (state.mode === "new") {
      if (state.kind === "client") setClient(state.seed ?? DEFAULT_CLIENT_PROFILE);
      else setServer(state.seed ?? DEFAULT_SERVER_CONFIG);
      return;
    }
    // edit: fetch existing
    setLoading(true);
    const url = API_ITEM[state.kind](state.name);
    fetch(url)
      .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        if (state.kind === "client" && data.profile) setClient(data.profile as ClientProfile);
        if (state.kind === "server" && data.server) setServer(data.server as ServerConfig);
      })
      .catch((err) => toast.error(`Load failed: ${(err as Error).message}`))
      .finally(() => setLoading(false));
  }, [state]);

  if (!state) return null;

  const isNew = state.mode === "new";
  const title = `${isNew ? "New" : "Edit"} ${LABEL[state.kind]}`;
  const subpath = state.kind === "client" ? "data/profiles/client" : "data/profiles/servers";

  const onSubmit = async () => {
    // client-side validate
    const currentErrors =
      state.kind === "client" ? validateClientProfile(client) : validateServerConfig(server);
    setErrors(currentErrors);
    if (Object.keys(currentErrors).length > 0) {
      toast.error("Fix highlighted fields and try again");
      return;
    }

    setSaving(true);
    try {
      const body = state.kind === "client" ? client : server;
      const url = isNew ? API_LIST[state.kind] : API_ITEM[state.kind]((body as { name: string }).name);
      const res = await fetch(url, {
        method: isNew ? "POST" : "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        issues?: Array<{ path: (string | number)[]; message: string }>;
      };
      if (!res.ok) {
        // server-side validation errors
        if (data.issues) {
          const out: Record<string, string> = {};
          for (const i of data.issues) {
            const key = i.path.join(".");
            if (!out[key]) out[key] = i.message;
          }
          setErrors(out);
        }
        toast.error(data.message ?? data.error ?? "Save failed");
        return;
      }
      toast.success(isNew ? `Created` : `Saved`);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex h-[min(90vh,820px)] w-[min(780px,95vw)] flex-col rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-card)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[color:var(--color-border)] px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold">{title}</h2>
            <p className="font-mono text-[11px] text-[color:var(--color-muted-foreground)]">
              {subpath}/
              {isNew
                ? state.kind === "client"
                  ? client.name || "<name>"
                  : server.name || "<name>"
                : state.mode === "edit"
                  ? state.name
                  : "<name>"}
              .yaml
            </p>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose} title="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
          {loading ? (
            <div className="flex h-full items-center justify-center text-xs text-[color:var(--color-muted-foreground)]">
              Loading…
            </div>
          ) : state.kind === "client" ? (
            <ClientProfileForm value={client} onChange={setClient} errors={errors} mode={state.mode} />
          ) : (
            <ServerConfigForm value={server} onChange={setServer} errors={errors} mode={state.mode} />
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[color:var(--color-border)] px-5 py-3">
          <p className="text-[11px] text-[color:var(--color-muted-foreground)]">
            {Object.keys(errors).length > 0
              ? `${Object.keys(errors).length} field(s) need attention`
              : "Fields validated against schema on save"}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={onSubmit} disabled={saving || loading}>
              {saving ? "Saving…" : isNew ? "Create" : "Save changes"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
