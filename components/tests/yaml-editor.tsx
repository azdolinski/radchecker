"use client";

import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { useMemo } from "react";

const MonacoEditor = dynamic(
  () => import("@monaco-editor/react").then((m) => m.Editor),
  { ssr: false, loading: () => <div className="p-4 text-xs text-[color:var(--color-muted-foreground)]">Loading editor…</div> },
);

export function YamlEditor({
  value,
  onChange,
  readOnly,
  height = "calc(100vh - 260px)",
  language = "yaml",
}: {
  value: string;
  onChange: (next: string) => void;
  readOnly?: boolean;
  height?: string;
  language?: string;
}) {
  const { resolvedTheme } = useTheme();
  const theme = useMemo(() => (resolvedTheme === "dark" ? "vs-dark" : "light"), [resolvedTheme]);

  return (
    <MonacoEditor
      language={language}
      value={value}
      theme={theme}
      onChange={(v) => onChange(v ?? "")}
      height={height}
      options={{
        minimap: { enabled: false },
        fontSize: 12,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        tabSize: 2,
        wordWrap: "on",
        scrollBeyondLastLine: false,
        renderLineHighlight: "none",
        readOnly,
      }}
    />
  );
}
