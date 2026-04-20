import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { SettingsTabs } from "@/components/settings/settings-tabs";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell breadcrumb={["Settings"]}>
      <div className="flex h-full flex-col gap-4 p-6">
        <SettingsTabs />
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </AppShell>
  );
}
