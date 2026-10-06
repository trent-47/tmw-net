import { randomUUID } from "node:crypto";
import type { Capability, Event, Execution, Workflow } from "@/core/types";
import { ExecutionStore } from "@/core/executions/store";
import { validateWorkflow } from "@/core/workflows/definition";

export type CapabilityHandler = (input: Record<string, unknown>, event: Event) => Promise<Record<string, unknown>>;

function readConditionField(input: Record<string, unknown>, field: string): unknown {
  const aliases: Record<string, string> = { packetloss: "packetLossPercent", responsetime: "latencyMs" };
  const key = aliases[field.toLowerCase()] ?? field;
  const directValue = input[key];
  if (directValue !== undefined && directValue !== null) return directValue;
  return input.outcome && typeof input.outcome === "object"
    ? (input.outcome as Record<string, unknown>)[key]
    : undefined;
}

function matchesCondition(expression: string, input: Record<string, unknown>): boolean {
  const match = expression.trim().replace(/[()]/g, "").match(/^(status|severity|deviceName|ipAddress|packetLoss|packetLossPercent|responseTime|latencyMs)\s*(==|=|!=|>=|<=|>|<)\s*["']?(.+?)["']?$/i);
  if (!match) return false;
  const actual = readConditionField(input, match[1]);
  if (actual === undefined || actual === null) return false;
  const expected = match[3].trim();
  const actualNumber = Number(actual);
  const expectedNumber = Number(expected);
  if (Number.isFinite(actualNumber) && Number.isFinite(expectedNumber)) {
    switch (match[2]) {
      case "==": case "=": return actualNumber === expectedNumber;
      case "!=": return actualNumber !== expectedNumber;
      case ">": return actualNumber > expectedNumber;
      case ">=": return actualNumber >= expectedNumber;
      case "<": return actualNumber < expectedNumber;
      case "<=": return actualNumber <= expectedNumber;
    }
  }
  const left = String(actual).toLowerCase();
  const right = expected.toLowerCase();
  if (match[2] === "==" || match[2] === "=") return left === right;
  if (match[2] === "!=") return left !== right;
  return false;
}

function evaluateCondition(condition: string, input: Record<string, unknown>): boolean {
  if (!condition.trim()) return true;
  return condition.split(/\s+or\s+/i).some((group) =>
    group.split(/\s+and\s+/i).every((expression) => matchesCondition(expression, input)),
  );
}

export class AutomationEngine {
  private readonly handlers = new Map<string, CapabilityHandler>();
  readonly executions = new ExecutionStore();

  registerCapability(capability: Capability, handler: CapabilityHandler) {
    this.handlers.set(capability.name, handler);
  }

  async execute(workflow: Workflow, event: Event): Promise<Execution> {
    validateWorkflow(workflow);
    const execution: Execution = { id: randomUUID(), workflowId: workflow.id, status: "running", input: event.payload, startedAt: new Date().toISOString() };
    this.executions.save(execution);
    try {
      let output = event.payload;
      for (const node of workflow.nodes) {
        if (node.kind === "logic") {
          const condition = String((node.config as Record<string, unknown> | undefined)?.condition ?? "");
          if (!evaluateCondition(condition, output)) break;
          continue;
        }
        if (!node.capability) continue;
        const handler = this.handlers.get(node.capability);
        if (!handler) throw new Error(`Capability not registered: ${node.capability}`);
        output = await handler({ ...output, ...(node.config ?? {}) }, event);
      }
      const finished: Execution = { ...execution, status: "succeeded", output, finishedAt: new Date().toISOString() };
      return this.executions.save(finished);
    } catch (error) {
      const failed: Execution = { ...execution, status: "failed", error: error instanceof Error ? error.message : "Unknown execution error", finishedAt: new Date().toISOString() };
      return this.executions.save(failed);
    }
  }
}
