import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { workflowExecutions, workflowNodes, workflows } from "@/db/schema";
import type { Workflow } from "@/core/types";

type WorkflowRow = typeof workflows.$inferSelect;
type NodeRow = typeof workflowNodes.$inferSelect;

function toWorkflow(row: WorkflowRow, nodes: NodeRow[]): Workflow {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    trigger: { event: row.triggerEvent },
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    nodes: nodes
      .sort((a, b) => a.position - b.position)
      .map((node) => ({
        id: node.id,
        kind: node.kind as Workflow["nodes"][number]["kind"],
        name: node.name,
        ...(node.icon ? { icon: node.icon } : {}),
        ...(node.capability ? { capability: node.capability } : {}),
        ...(node.config && typeof node.config === "object" ? { config: node.config as Record<string, unknown> } : {}),
      })),
  };
}

/**
 * Workflow persistence on the single NetMoni database. Falls back to the
 * built-in in-memory seed when a workflow has not been persisted yet, so the
 * default "network-fault-notification" automation always exists.
 */
export class WorkflowRepository {
  private readonly fallback = new Map<string, Workflow>();

  async save(workflow: Workflow, organizationId: string): Promise<Workflow> {
    const now = new Date();
    await db().transaction(async (tx) => {
      await tx
        .insert(workflows)
        .values({
          id: workflow.id,
          organizationId,
          name: workflow.name,
          description: workflow.description,
          triggerEvent: workflow.trigger.event,
          enabled: workflow.enabled,
          createdAt: now,
          updatedAt: now,
        })
        // Workflow ids are unique per organization, not globally.
        .onConflictDoUpdate({
          target: [workflows.id, workflows.organizationId],
          set: { name: workflow.name, description: workflow.description, triggerEvent: workflow.trigger.event, enabled: workflow.enabled, updatedAt: now },
        });
      await tx.delete(workflowNodes).where(and(eq(workflowNodes.workflowId, workflow.id), eq(workflowNodes.organizationId, organizationId)));
      if (workflow.nodes.length) {
        await tx.insert(workflowNodes).values(
          workflow.nodes.map((node, index) => ({
            id: node.id,
            workflowId: workflow.id,
            organizationId,
            kind: node.kind,
            name: node.name,
            icon: node.icon ?? "zap",
            capability: node.capability,
            config: node.config,
            position: index,
          })),
        );
      }
    });
    return workflow;
  }

  async findById(id: string, organizationId = "local-workspace"): Promise<Workflow | undefined> {
    const rows = await db()
      .select()
      .from(workflows)
      .where(and(eq(workflows.id, id), eq(workflows.organizationId, organizationId)))
      .limit(1);
    const row = rows[0];
    if (!row) {
      const seeded = this.fallback.get(id);
      if (seeded) {
        // Materialize the built-in workflow for this organization and return
        // the persisted row so callers read back what is actually stored.
        return this.save(seeded, organizationId);
      }
      return undefined;
    }
    const nodes = await db().select().from(workflowNodes).where(eq(workflowNodes.workflowId, row.id));
    return toWorkflow(row, nodes);
  }

  async delete(id: string, organizationId = "local-workspace"): Promise<boolean> {
    const deleted = await db()
      .delete(workflows)
      .where(and(eq(workflows.id, id), eq(workflows.organizationId, organizationId)))
      .returning({ id: workflows.id });
    return deleted.length > 0;
  }

  async list(organizationId = "local-workspace"): Promise<Workflow[]> {
    const rows = await db().select().from(workflows).where(eq(workflows.organizationId, organizationId)).orderBy(workflows.createdAt);
    const out: Workflow[] = [];
    for (const row of rows) {
      const nodes = await db().select().from(workflowNodes).where(eq(workflowNodes.workflowId, row.id));
      out.push(toWorkflow(row, nodes));
    }
    return out;
  }

  async recordExecution(input: { organizationId: string; workflowId: string; status: string; inputPayload: Record<string, unknown>; output?: Record<string, unknown>; error?: string; startedAt: Date; finishedAt?: Date }) {
    await db().insert(workflowExecutions).values({
      id: randomUUID(),
      organizationId: input.organizationId,
      workflowId: input.workflowId,
      status: input.status,
      input: input.inputPayload,
      output: input.output,
      error: input.error,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
    });
  }

  /** Registers the built-in workflow so it materializes on first use. */
  seed(workflow: Workflow) {
    this.fallback.set(workflow.id, workflow);
  }
}
