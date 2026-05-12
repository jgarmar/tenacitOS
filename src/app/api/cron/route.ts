import { NextRequest, NextResponse } from "next/server";
import { execSync, execFileSync } from "child_process";

// GET: List all cron jobs from the OpenClaw gateway
export async function GET() {
  try {
    const output = execSync("openclaw cron list --json --all", {
      env: { ...process.env, OPENCLAW_NO_RESPAWN: "1", NODE_COMPILE_CACHE: "/var/tmp/openclaw-compile-cache" },
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 30000,
      encoding: "utf-8",
    });

    const data = JSON.parse(output);
    const jobs = (data.jobs || []).map((job: Record<string, unknown>) => ({
      id: job.id,
      agentId: job.agentId || "main",
      name: job.name || "Unnamed",
      enabled: job.enabled ?? true,
      createdAtMs: job.createdAtMs,
      updatedAtMs: job.updatedAtMs,
      schedule: job.schedule,
      sessionTarget: job.sessionTarget,
      payload: job.payload,
      delivery: job.delivery,
      state: job.state,
      description: formatDescription(job),
      scheduleDisplay: formatSchedule(job.schedule as Record<string, unknown>),
      timezone: (job.schedule as Record<string, string>)?.tz || "UTC",
      nextRun: (job.state as Record<string, unknown>)?.nextRunAtMs
        ? new Date((job.state as Record<string, number>).nextRunAtMs).toISOString()
        : null,
      lastRun: (job.state as Record<string, unknown>)?.lastRunAtMs
        ? new Date((job.state as Record<string, number>).lastRunAtMs).toISOString()
        : null,
    }));

    return NextResponse.json(jobs);
  } catch (error) {
    console.error("Error fetching cron jobs from gateway:", error);
    return NextResponse.json(
      { error: "Failed to fetch cron jobs from OpenClaw gateway" },
      { status: 500 }
    );
  }
}

function formatDescription(job: Record<string, unknown>): string {
  const payload = job.payload as Record<string, unknown>;
  if (!payload) return "";
  if (payload.kind === "agentTurn") {
    const msg = (payload.message as string) || "";
    return msg.length > 120 ? msg.substring(0, 120) + "..." : msg;
  }
  if (payload.kind === "systemEvent") {
    const text = (payload.text as string) || "";
    return text.length > 120 ? text.substring(0, 120) + "..." : text;
  }
  return "";
}

function formatSchedule(schedule: Record<string, unknown>): string {
  if (!schedule) return "Unknown";
  switch (schedule.kind) {
    case "cron":
      return `${schedule.expr}${schedule.tz ? ` (${schedule.tz})` : ""}`;
    case "every": {
      const ms = schedule.everyMs as number;
      if (ms >= 3600000) return `Every ${ms / 3600000}h`;
      if (ms >= 60000) return `Every ${ms / 60000}m`;
      return `Every ${ms / 1000}s`;
    }
    case "at":
      return `Once at ${schedule.at}`;
    default:
      return JSON.stringify(schedule);
  }
}

// POST: Create a new cron job
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, schedule, timezone, description, agentId, message } = body;

    if (!name || !schedule) {
      return NextResponse.json({ error: "name and schedule are required" }, { status: 400 });
    }

    const tz = timezone || "UTC";
    const agent = agentId || "pirion";
    const msg = message || `Run scheduled task: ${name}`;

    const args = [
      "cron", "add",
      "--name", name,
      "--cron", schedule,
      "--tz", tz,
      "--agent", agent,
      "--message", msg,
      "--json",
    ];
    if (description) {
      args.push("--description", description);
    }

    execFileSync("openclaw", args, { timeout: 30000, encoding: "utf-8" });

    return GET();
  } catch (error) {
    console.error("Error creating cron job:", error);
    return NextResponse.json(
      { error: "Failed to create cron job" },
      { status: 500 }
    );
  }
}

// PUT: Toggle enable/disable OR edit name/schedule/description
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, enabled, name, schedule, timezone, description } = body;

    if (!id) {
      return NextResponse.json({ error: "Job ID is required" }, { status: 400 });
    }

    // Edit job fields if name or schedule provided
    if (name !== undefined || schedule !== undefined) {
      const args = ["cron", "edit", id];
      if (name) args.push("--name", name);
      if (schedule) args.push("--cron", schedule);
      if (timezone) args.push("--tz", timezone);
      if (description !== undefined) args.push("--description", description);

      execFileSync("openclaw", args, { timeout: 30000, encoding: "utf-8" });
      return NextResponse.json({ success: true, id });
    }

    // Toggle enable/disable
    if (enabled !== undefined) {
      const action = enabled ? "enable" : "disable";
      execFileSync("openclaw", ["cron", action, id], {
        timeout: 30000,
        encoding: "utf-8",
      });
      return NextResponse.json({ success: true, id, enabled });
    }

    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  } catch (error) {
    console.error("Error updating cron job:", error);
    return NextResponse.json(
      { error: "Failed to update cron job" },
      { status: 500 }
    );
  }
}

// DELETE: Remove a cron job
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Job ID is required" }, { status: 400 });
    }

    execFileSync("openclaw", ["cron", "rm", id], {
      timeout: 30000,
      encoding: "utf-8",
    });

    return NextResponse.json({ success: true, deleted: id });
  } catch (error) {
    console.error("Error deleting cron job:", error);
    return NextResponse.json(
      { error: "Failed to delete cron job" },
      { status: 500 }
    );
  }
}
