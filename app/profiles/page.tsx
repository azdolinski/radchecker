import { AppShell } from "@/components/app-shell";
import { ProfilesConsole } from "@/components/profiles/profiles-console";

export default function ProfilesPage() {
  return (
    <AppShell breadcrumb={["Profiles"]}>
      <div className="h-full p-6">
        <ProfilesConsole />
      </div>
    </AppShell>
  );
}
