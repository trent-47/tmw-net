import { NextResponse } from "next/server";
import { publishEvent, workflowRepository } from "@/core/runtime";
import { sessionWorkspace } from "@/auth/store";
import { automationEngine } from "@/core/registry";
import { validateWorkflow } from "@/core/workflows/definition";
import type { Workflow } from "@/core/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json() as { type?: string; payload?: Record<string, unknown>; source?: string };
  if (!body.type) return NextResponse.json({ error: "Event type is required" }, { status: 400 });
  const organizationId = await sessionWorkspace(request);

  if (body.type === "workflow.execute") {
    const probe = (["ping", "tcp", "snmp"] as const).includes(body.payload?.probe as "ping") ? (body.payload?.probe as "ping" | "tcp" | "snmp") : "ping";
    const startedAt = new Date();
    const submitted = body.payload?.workflow;
    let workflow: Workflow | undefined;
    if (submitted && typeof submitted === "object") {
      const submittedWorkflow = submitted as Workflow;
      try {
        workflow = validateWorkflow({
          ...submittedWorkflow,
          enabled: true,
          createdAt: submittedWorkflow.createdAt ?? new Date().toISOString(),
          updatedAt: submittedWorkflow.updatedAt ?? new Date().toISOString(),
        });
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid workflow" }, { status: 400 });
      }
    } else {
      workflow = await workflowRepository.findById("network-fault-notification", organizationId);
    }
    if (!workflow) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });

    const executionEvent = {
      id: crypto.randomUUID(),
      type: "workflow.test",
      payload: { organizationId, ...(body.payload ?? {}), probe },
      source: "workflow-editor",
      occurredAt: new Date().toISOString(),
    };
    const execution = await automationEngine.execute(workflow, executionEvent);
    await workflowRepository.recordExecution({
      organizationId,
      workflowId: workflow.id,
      status: execution.status,
      inputPayload: { probe, ...(body.payload ?? {}) },
      output: execution.output,
      error: execution.error,
      startedAt,
      finishedAt: new Date(),
    });
    const executions = [{ workflowId: workflow.id, status: execution.status, output: execution.output }];
    return NextResponse.json({ event: { type: body.type, occurredAt: new Date().toISOString() }, executions }, { status: 202 });
  }

  return NextResponse.json(await publishEvent(body.type, { organizationId, ...(body.payload ?? {}) }, body.source ?? "api"), { status: 202 });
}
