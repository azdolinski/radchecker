"use client";

import type { ComponentType, ReactNode } from "react";
import { Copy, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface ListBlockProps<T extends { name: string }> {
  /** Used only to render the `data/profiles/<kind>/` subtitle. */
  kind: string;
  title: string;
  subtitle: string;
  icon: ComponentType<{ className?: string }>;
  items: T[];
  onRefresh: () => void;
  onEdit: (name: string) => void;
  onNew: () => void;
  onDelete: (name: string) => Promise<void>;
  onDuplicate: (name: string) => void;
  renderMeta: (item: T) => ReactNode;
  /** Optional leading slot rendered left of the name column. */
  renderLeading?: (item: T) => ReactNode;
  loading: boolean;
}

export function ListBlock<T extends { name: string }>({
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
  renderLeading,
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
              {renderLeading ? renderLeading(item) : null}
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
