"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AttributePair } from "@/lib/storage/schemas";
import { cn } from "@/lib/utils";

interface Props {
  value: AttributePair[];
  onChange: (next: AttributePair[]) => void;
  readOnly?: boolean;
}

interface AttributeSuggestion {
  name: string;
  code: number;
  type: string;
  vendor?: string;
}

interface CachedResponse {
  revision: number;
  list: AttributeSuggestion[];
}

let cached: Promise<CachedResponse> | null = null;

async function fetchAttributes(): Promise<CachedResponse> {
  if (!cached) {
    cached = fetch("/api/dictionary/attributes")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const body = (await r.json()) as {
          attributes: AttributeSuggestion[];
          revision: number;
        };
        return { revision: body.revision, list: body.attributes };
      })
      .catch((err) => {
        // Don't let a failed fetch stick in the cache.
        cached = null;
        throw err;
      });
  }
  return cached;
}

export function AttributesEditor({ value, onChange, readOnly = false }: Props) {
  const [suggestions, setSuggestions] = useState<AttributeSuggestion[]>([]);

  useEffect(() => {
    let cancelled = false;
    void fetchAttributes()
      .then((c) => {
        if (!cancelled) setSuggestions(c.list);
      })
      .catch(() => {
        // Silent — combobox just falls back to free text.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const set = (idx: number, patch: Partial<AttributePair>) => {
    onChange(value.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };
  const remove = (idx: number) => onChange(value.filter((_, i) => i !== idx));
  const add = () => onChange([...value, { name: "", value: "" }]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Attributes</Label>
        {!readOnly && (
          <Button size="sm" variant="outline" onClick={add} type="button">
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        )}
      </div>
      {value.length === 0 ? (
        <div className="rounded-md border border-dashed border-[color:var(--color-border)] p-4 text-center text-[11px] text-[color:var(--color-muted-foreground)]">
          No attributes
          {readOnly ? (
            "."
          ) : (
            <>
              . Click <span className="font-medium">Add</span> to include fields like{" "}
              <code className="font-mono">User-Name</code> or{" "}
              <code className="font-mono">Acct-Session-Id</code>.
            </>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          {value.map((row, idx) => (
            <div key={idx} className="flex items-center gap-1.5">
              <div className="flex-[2]">
                <AttributeNameCombobox
                  value={row.name}
                  suggestions={suggestions}
                  disabled={readOnly}
                  onChange={(name) => set(idx, { name })}
                />
              </div>
              <Input
                className="flex-[3] font-mono text-xs"
                placeholder="value"
                value={String(row.value)}
                disabled={readOnly}
                onChange={(e) => {
                  const raw = e.target.value;
                  const asNum = Number(raw);
                  const isNum = raw !== "" && !Number.isNaN(asNum) && /^-?\d+(\.\d+)?$/.test(raw);
                  set(idx, { value: isNum ? asNum : raw });
                }}
              />
              {!readOnly && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => remove(idx)}
                  type="button"
                  title="Remove attribute"
                >
                  <X className="h-3.5 w-3.5 text-[color:var(--color-muted-foreground)]" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface ComboboxProps {
  value: string;
  suggestions: AttributeSuggestion[];
  disabled?: boolean;
  onChange: (next: string) => void;
}

function AttributeNameCombobox({ value, suggestions, disabled, onChange }: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (q === "") return suggestions.slice(0, 20);
    return suggestions
      .filter((s) => s.name.toLowerCase().includes(q))
      .slice(0, 20);
  }, [value, suggestions]);

  useEffect(() => {
    setHighlight(0);
  }, [value, open]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const pick = (idx: number) => {
    const chosen = filtered[idx];
    if (chosen) onChange(chosen.name);
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        className="w-full font-mono text-xs"
        placeholder="Attribute-Name"
        value={value}
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (!open || filtered.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, filtered.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(highlight);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && filtered.length > 0 ? (
        <ul className="absolute left-0 right-0 z-20 mt-1 max-h-64 overflow-auto rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-background)] shadow-lg">
          {filtered.map((s, i) => (
            <li
              key={s.name}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(i);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-2 px-2 py-1.5 text-xs",
                i === highlight && "bg-[color:var(--color-muted)]/60",
              )}
            >
              <span className="font-mono">{s.name}</span>
              <span className="text-[10px] text-[color:var(--color-muted-foreground)]">
                {s.vendor ? `${s.vendor} · ` : ""}
                {s.type}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
