import { AppShell } from "@/components/app-shell";
import { ClientConsole } from "@/components/client/client-console";

export default function ClientPage() {
  return (
    <AppShell breadcrumb={["Client Emulator"]}>
      <div className="h-full p-6">
        <ClientConsole />
      </div>
    </AppShell>
  );
}
