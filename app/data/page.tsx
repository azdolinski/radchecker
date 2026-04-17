import { AppShell } from "@/components/app-shell";
import { FileBrowser } from "@/components/data/file-browser";

export default function DataPage() {
  return (
    <AppShell breadcrumb={["Data"]}>
      <div className="h-full p-6">
        <FileBrowser />
      </div>
    </AppShell>
  );
}
