"use client";

import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AttributePair } from "@/lib/storage/schemas";

interface Props {
  value: AttributePair[];
  onChange: (next: AttributePair[]) => void;
  readOnly?: boolean;
}

export function AttributesEditor({ value, onChange, readOnly = false }: Props) {
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
              <Input
                className="flex-[2] font-mono text-xs"
                placeholder="Attribute-Name"
                value={row.name}
                disabled={readOnly}
                onChange={(e) => set(idx, { name: e.target.value })}
              />
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
