import * as React from "react";

import { cn } from "@/lib/utils";
import { Input, type InputProps } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface FieldProps extends Omit<InputProps, "id"> {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  suffix?: string;
}

export const Field = React.forwardRef<HTMLInputElement, FieldProps>(
  ({ id, label, hint, error, suffix, className, ...rest }, ref) => (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {rest.required ? <span className="ml-0.5 text-red-500">*</span> : null}
      </Label>
      <div className="relative">
        <Input ref={ref} id={id} {...rest} className={suffix ? "pr-12" : undefined} />
        {suffix ? (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[color:var(--color-muted-foreground)]">
            {suffix}
          </span>
        ) : null}
      </div>
      {error ? (
        <p className="text-[11px] text-red-500">{error}</p>
      ) : hint ? (
        <p className="text-[11px] text-[color:var(--color-muted-foreground)]">{hint}</p>
      ) : null}
    </div>
  ),
);
Field.displayName = "Field";

export function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2 border-b border-[color:var(--color-border)]/60 pb-1.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-foreground)]">
          {title}
        </h3>
        {subtitle ? (
          <span className="text-[11px] text-[color:var(--color-muted-foreground)]">{subtitle}</span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

interface SelectFieldProps {
  id: string;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
  hint?: string;
}

export function SelectField({ id, label, value, options, onChange, hint }: SelectFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-9 w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-background)] px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--color-ring)]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint ? <p className="text-[11px] text-[color:var(--color-muted-foreground)]">{hint}</p> : null}
    </div>
  );
}
