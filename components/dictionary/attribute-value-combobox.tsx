"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ValuesPayload {
  values: Record<string, string[]>;
}

let cached: Promise<Record<string, string[]>> | null = null;

async function fetchValues(): Promise<Record<string, string[]>> {
  if (!cached) {
    cached = fetch("/api/dictionary/values")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const body = (await r.json()) as ValuesPayload;
        return body.values;
      })
      .catch((err) => {
        cached = null;
        throw err;
      });
  }
  return cached;
}

interface Props {
  id?: string;
  attribute: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Text input with a typeahead dropdown of VALUE names defined for the given
 * RADIUS attribute in any enabled dictionary. Free-text is accepted — unknown
 * values still save without error.
 */
export function AttributeValueCombobox({
  id,
  attribute,
  value,
  onChange,
  placeholder,
  disabled,
}: Props) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchValues()
      .then((all) => {
        if (!cancelled) setSuggestions(all[attribute] ?? []);
      })
      .catch(() => {
        /* silent — picker falls back to free text */
      });
    return () => {
      cancelled = true;
    };
  }, [attribute]);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (q === "") return suggestions.slice(0, 20);
    return suggestions.filter((s) => s.toLowerCase().includes(q)).slice(0, 20);
  }, [value, suggestions]);

  useEffect(() => {
    setHighlight(0);
  }, [value, open]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const pick = (idx: number) => {
    const chosen = filtered[idx];
    if (chosen) onChange(chosen);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative">
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
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
              key={s}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(i);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={cn(
                "cursor-pointer px-2 py-1.5 font-mono text-xs",
                i === highlight && "bg-[color:var(--color-muted)]/60",
              )}
            >
              {s}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
