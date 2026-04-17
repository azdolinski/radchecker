import { NextResponse } from "next/server";

import { listTests, readTest } from "@/lib/storage/yamlStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const names = await listTests();
  const items = await Promise.all(
    names.map(async (name) => {
      try {
        const t = await readTest(name);
        return {
          name,
          title: t.test.name,
          description: t.test.description,
          expect: t.radius.expect,
        };
      } catch {
        return {
          name,
          title: `${name} (invalid)`,
          description: undefined,
          expect: "—",
        };
      }
    }),
  );
  return NextResponse.json({ tests: items });
}
