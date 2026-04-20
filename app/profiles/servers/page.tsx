import { AppShell } from "@/components/app-shell";
import { ProfilesConsole } from "@/components/profiles/profiles-console";

export default function ProfilesServersPage() {
  return (
    <AppShell breadcrumb={["Profiles", "Radius server"]}>
      <div className="flex h-full flex-col p-6">
        <ProfilesConsole />
      </div>
    </AppShell>
  );
}
