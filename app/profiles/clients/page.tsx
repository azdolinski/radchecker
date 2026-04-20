import { AppShell } from "@/components/app-shell";
import { ClientProfilesConsole } from "@/components/profiles/client-profiles-console";

export default function ProfilesClientsPage() {
  return (
    <AppShell breadcrumb={["Profiles", "Radius client"]}>
      <div className="flex h-full flex-col p-6">
        <ClientProfilesConsole />
      </div>
    </AppShell>
  );
}
