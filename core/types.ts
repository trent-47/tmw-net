export type ResourceKind = "postgres" | "mysql" | "sqlite" | "http" | "storage" | "queue";
export type NodeKind = "trigger" | "action" | "logic";
export type ExecutionStatus = "queued" | "running" | "succeeded" | "failed";

export type Event = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  source: string;
  occurredAt: string;
};

export type Capability = {
  name: string;
  description: string;
  input: Record<string, string>;
  output: Record<string, string>;
};

export type WorkflowNode = {
  id: string;
  kind: NodeKind;
  name: string;
  icon?: string;
  capability?: string;
  config?: Record<string, unknown>;
};

export type Workflow = {
  id: string;
  name: string;
  description: string;
  trigger: { event: string };
  nodes: WorkflowNode[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Execution = {
  id: string;
  workflowId: string;
  status: ExecutionStatus;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  startedAt: string;
  finishedAt?: string;
};

export type Connector = {
  id: string;
  name: string;
  kind: ResourceKind;
  config: Record<string, unknown>;
};
