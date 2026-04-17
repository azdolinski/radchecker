import { NextResponse } from "next/server";
import { z } from "zod";

import { createJob, jobSnapshot, setStatus } from "@/lib/jobs/registry";
import { runTestFixture } from "@/lib/radius/testRunner";
import { listTests, readTest } from "@/lib/storage/yamlStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = z.object({
  names: z.array(z.string()).optional(),
  all: z.boolean().default(false),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  }

  const allNames = parsed.data.all ? await listTests() : (parsed.data.names ?? []);
  if (allNames.length === 0) {
    return NextResponse.json({ error: "no_tests_selected" }, { status: 400 });
  }

  let stopped = false;
  const job = createJob({
    kind: "test-run",
    name: allNames.length === 1 ? allNames[0] : `batch(${allNames.length})`,
    config: { names: allNames },
    stop: async () => {
      stopped = true;
    },
  });

  setStatus(job, "running");

  // Run asynchronously; don't block the HTTP response.
  void (async () => {
    const stats = {
      total: allNames.length,
      passed: 0,
      failed: 0,
      ran: 0,
      results: [] as Array<{
        name: string;
        pass: boolean;
        expected: string;
        actual?: string;
        durationMs: number;
        error?: string;
        attrFailures: number;
      }>,
    };
    job.bus.stats({ ...stats });

    for (const name of allNames) {
      if (stopped) {
        job.bus.warn(`stopped after ${stats.ran} test(s)`);
        break;
      }
      job.bus.info(`run ${name}`);
      try {
        const fixture = await readTest(name);
        const result = await runTestFixture(name, fixture);
        stats.ran += 1;
        if (result.pass) stats.passed += 1;
        else stats.failed += 1;
        stats.results.push({
          name,
          pass: result.pass,
          expected: result.expected,
          actual: result.actual,
          durationMs: result.durationMs,
          error: result.error,
          attrFailures: result.attributeFailures.length,
        });
        job.bus.log(result.pass ? "info" : "warn", `${result.pass ? "PASS" : "FAIL"} ${name} → ${result.actual ?? "—"} [${result.durationMs}ms]`, result);
        job.bus.stats({ ...stats });
      } catch (err) {
        stats.ran += 1;
        stats.failed += 1;
        const msg = err instanceof Error ? err.message : String(err);
        stats.results.push({
          name,
          pass: false,
          expected: "—",
          durationMs: 0,
          error: msg,
          attrFailures: 0,
        });
        job.bus.error(`FAIL ${name}: ${msg}`);
        job.bus.stats({ ...stats });
      }
    }

    setStatus(job, "completed");
  })();

  return NextResponse.json({ job: jobSnapshot(job) }, { status: 202 });
}
