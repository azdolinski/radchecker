import { AppShell } from "@/components/app-shell";
import { CoAConsole } from "@/components/coa/coa-console";

export default function CoAPage() {
  return (
    <AppShell breadcrumb={["CoA Server"]}>
      <div className="h-full p-6">
        <CoAConsole />
      </div>
    </AppShell>
  );
}
