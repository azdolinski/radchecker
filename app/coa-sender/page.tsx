import { AppShell } from "@/components/app-shell";
import { CoASenderConsole } from "@/components/coa-sender/coa-sender-console";

export default function CoASenderPage() {
  return (
    <AppShell breadcrumb={["CoA Sender"]}>
      <div className="h-full p-6">
        <CoASenderConsole />
      </div>
    </AppShell>
  );
}
