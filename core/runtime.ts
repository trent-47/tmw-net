import { randomUUID } from "node:crypto";
import { automationEngine, capabilityRegistry, eventBus } from "@/core/registry";
import { createWorkflow } from "@/core/workflows/definition";
import { WorkflowRepository } from "@/db/repositories/workflow-repository";
import { builtInCapabilities } from "@/nodes";
import { networkMonitor } from "@/core/monitoring/monitor";
import { synthesizeFaultMessage } from "@/core/monitoring/ai";
import { renderTemplate, sendFaultEmail, smtpConfigFromEnv } from "@/core/monitoring/mailer";
import { tenantMonitorStore } from "@/core/monitoring/store";
import { tcpProbe } from "@/core/monitoring/probes";
import type { Event } from "@/core/types";
import type { NetworkDevice } from "@/core/monitoring/types";

export const workflowRepository = new WorkflowRepository();

for (const capability of builtInCapabilities) {
  capabilityRegistry.register(capability);
  automationEngine.registerCapability(capability, async (input) => ({ ...input, accepted: true, id: randomUUID() }));
}

automationEngine.registerCapability({ name: "monitor_device", description: "Run a ping/TCP/SNMP probe against a network device", input: {}, output: {} }, async (input, event) => {
  const organizationId = String(input.organizationId ?? event.source ?? "local-workspace");
  const device = await tenantMonitorStore.listDevices(organizationId).then((devices) => devices.find((entry) => entry.id === input.deviceId || entry.ip === input.ipAddress));
  if (!device) return { ...input, fault: false, reason: "Device not registered" };
  const outcome = await networkMonitor.processCheck(organizationId, device, (input.probe as "ping" | "tcp" | "snmp") ?? "ping", { notify: true });
  return { ...input, fault: !outcome.ok || outcome.status !== "Online", outcome };
});

automationEngine.registerCapability({ name: "ai_fault_message", description: "Synthesize an administrator-ready fault message with AI", input: {}, output: {} }, async (input) => {
  const organizationId = String(input.organizationId ?? "local-workspace");
  const devices = await tenantMonitorStore.listDevices(organizationId);
  const device = devices.find((entry) => entry.id === input.deviceId || entry.ip === input.ipAddress || entry.name === input.deviceName) ?? devices[0];
  if (!device) return { ...input, subject: "Network monitoring", body: "No registered devices available for synthesis.", rendered: false };
  const settings = await tenantMonitorStore.getSettings(organizationId);
  const checks = await tenantMonitorStore.listChecks(organizationId, { deviceId: device.id, limit: 10 });
  const severity = input.severity as "critical" | "warning" | "info" | undefined;
  const message = await synthesizeFaultMessage(
    {
      device: { name: device.name, ip: device.ip, type: device.type, subnet: device.subnet, mac: device.mac },
      severity: severity ?? "warning",
      status: String(input.status ?? device.status),
      probe: String(input.probe ?? "ping"),
      checks,
      instruction: String(input.instruction ?? settings.aiInstruction),
      recommendation: String(input.recommendation ?? "Diagnose the latest monitoring evidence and recommend the next specific troubleshooting step."),
    },
    {
      provider: String(input.provider ?? settings.aiProvider),
      model: String(input.model ?? settings.aiModel),
      apiKey: await tenantMonitorStore.getAiApiKey(organizationId),
    },
  );
  return { ...input, subject: message.subject, body: message.body, provider: message.provider, model: message.model, synthesized: message.synthesized };
});

automationEngine.registerCapability({ name: "send_admin_email", description: "Send the fault message to the administrator through SMTP", input: {}, output: {} }, async (input) => {
  const organizationId = String(input.organizationId ?? "local-workspace");
  const smtp = await tenantMonitorStore.getSmtpConfig(organizationId) ?? smtpConfigFromEnv();
  const to = String(input.to ?? process.env.ADMIN_EMAIL ?? "");
  if (!smtp) return { ...input, emailStatus: "not-configured", detail: "Set SMTP_USER and SMTP_PASSWORD to enable dispatch" };
  if (!to) return { ...input, emailStatus: "missing-recipient", detail: "No admin email configured" };
  const body = String(input.body ?? "Network fault detected.");
  const subject = renderTemplate(String(input.subject ?? "[Network Alert] {{deviceName}} is {{status}}"), input);
  const sent = await sendFaultEmail(smtp, { to, subject, text: body });
  return { ...input, emailStatus: "sent", messageId: sent.messageId, accepted: sent.accepted };
});

automationEngine.registerCapability({ name: "tcp_check", description: "Run a TCP reachability check against a host and port", input: {}, output: {} }, async (input) => {
  const host = String(input.host ?? input.ipAddress ?? "");
  if (!host) return { ...input, open: false, reason: "No host provided" };
  const result = await tcpProbe(host, Number(input.port ?? 80));
  return { ...input, open: result.open, latencyMs: result.latencyMs, error: result.error };
});

// The default fault-notification workflow is persisted to Postgres on first use.
workflowRepository.seed(createWorkflow({
  id: "network-fault-notification",
  name: "Network Fault Notification",
  description: "Ping/TCP/SNMP monitoring with AI synthesis and administrator email dispatch.",
  trigger: { event: "monitor.run" },
  nodes: [
    { id: "monitor-devices", kind: "action", name: "Monitor devices", capability: "monitor_device", config: { probe: "ping" } },
    { id: "check-severity", kind: "logic", name: "Check severity", config: { condition: "status == Offline OR severity == Critical" } },
    { id: "ai-message", kind: "action", name: "AI fault message", capability: "ai_fault_message", config: { instruction: "Explain the network fault, affected device, severity and recommended action." } },
    { id: "send-email", kind: "action", name: "Send Gmail", capability: "send_admin_email", config: { host: "smtp.gmail.com", port: 465, secure: true } },
  ],
}));

export async function publishEvent(type: string, payload: Record<string, unknown>, source = "api") {
  const event: Event = { id: randomUUID(), type, payload, source, occurredAt: new Date().toISOString() };
  await eventBus.publish(event);
  const organizationId = String(payload.organizationId ?? "local-workspace");
  const workflows = (await workflowRepository.list(organizationId)).filter((workflow) => workflow.enabled && workflow.trigger.event === type);
  const executions = await Promise.all(workflows.map((workflow) => automationEngine.execute(workflow, event)));
  return { event, executions };
}

export function deviceEventPayload(device: NetworkDevice) {
  return { deviceId: device.id, deviceName: device.name, ipAddress: device.ip, status: device.status, severity: device.status === "Offline" ? "critical" : "warning" };
}
