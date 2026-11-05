import { randomUUID } from "node:crypto";
import { runProbe } from "@/core/monitoring/probes";
import { synthesizeFaultMessage } from "@/core/monitoring/ai";
import { buildNotificationHtml, renderTemplate, sendFaultEmail, smtpConfigFromEnv } from "@/core/monitoring/mailer";
import { tenantMonitorStore } from "@/core/monitoring/store";
import { alertSeverity, type CheckRow, type NetworkAlert, type NetworkDevice } from "@/core/monitoring/types";
import { triggerRealtime } from "@/core/realtime";
import { getAcknowledgeUrl } from "@/core/alert-ack";

export type AlertPayload = {
  device: Pick<NetworkDevice, "id" | "name" | "ip" | "type" | "subnet" | "mac">;
  severity: NetworkAlert["severity"];
  status: string;
  summary: string;
  recommendation: string;
  evidence: Record<string, unknown>;
};

export type MonitorOutcome = {
  deviceId: string;
  deviceName: string;
  ip: string;
  probe: string;
  ok: boolean;
  latencyMs: number | null;
  packetLossPercent: number;
  bandwidthInMbps: number | null;
  bandwidthOutMbps: number | null;
  status: NetworkDevice["status"];
  alert: NetworkAlert | null;
  message: { subject: string; body: string; provider: string; model: string; synthesized: boolean } | null;
  email: { to: string; status: string; detail?: string } | null;
  command?: string;
  output?: string;
};

class NetworkMonitor {
  private evaluateStatus(device: NetworkDevice, ok: boolean, consecutiveFailures: number, latencyMs: number | null, packetLossPercent: number, settings: { latencyWarningMs: number; packetLossWarningPercent: number; failureThreshold?: number }): NetworkDevice["status"] {
    if (!ok) {
      const threshold = Math.max(1, Number(settings.failureThreshold ?? 3));
      if (consecutiveFailures >= threshold) return "Offline";
      return "Warning";
    }
    if ((latencyMs ?? 0) > settings.latencyWarningMs) return "Warning";
    if (packetLossPercent >= settings.packetLossWarningPercent) return "Warning";
    return "Online";
  }

  buildAlert(device: NetworkDevice, check: CheckRow, severity: NetworkAlert["severity"], status: string): AlertPayload {
    return {
      device: { id: device.id, name: device.name, ip: device.ip, type: device.type, subnet: device.subnet, mac: device.mac },
      severity,
      status,
      summary: `${device.name} (${device.ip}) reported ${status} via ${check.probe} probe: latency ${check.latencyMs ?? "n/a"} ms, packet loss ${check.packetLossPercent}%${check.bandwidthInMbps !== null ? `, bandwidth in ${check.bandwidthInMbps.toFixed(2)} Mbps` : ""}${check.bandwidthOutMbps !== null ? `, out ${check.bandwidthOutMbps.toFixed(2)} Mbps` : ""}.`,
      recommendation: status === "Offline"
        ? "Check power, cabling and the upstream switch port; confirm gateway reachability, then escalate to the circuit provider if the path is down."
        : "Review interface errors and saturation on this link; confirm QoS, latency and packet loss trends during the next maintenance window.",
      evidence: {
        probe: check.probe,
        latencyMs: check.latencyMs,
        packetLossPercent: check.packetLossPercent,
        bandwidthInMbps: check.bandwidthInMbps,
        bandwidthOutMbps: check.bandwidthOutMbps,
        detail: check.detail,
        checkedAt: check.checkedAt,
      },
    };
  }

  async processCheck(organizationId: string, device: NetworkDevice, kind: CheckRow["probe"], options: { port?: number; community?: string; notify?: boolean } = {}): Promise<MonitorOutcome> {
    const settings = await tenantMonitorStore.getSettings(organizationId);
    const probe = await runProbe(kind, device.ip, options);
    const recentChecks = await tenantMonitorStore.listChecks(organizationId, { deviceId: device.id, limit: Math.max(1, settings.failureThreshold) });
    let consecutiveFailures = probe.ok ? 0 : 1;
    if (!probe.ok) {
      for (const previous of recentChecks) {
        if (previous.probe !== kind || previous.ok) break;
        consecutiveFailures += 1;
      }
    }
    const status = this.evaluateStatus(device, probe.ok, consecutiveFailures, probe.latencyMs, probe.packetLossPercent, {
      latencyWarningMs: settings.latencyWarningMs,
      packetLossWarningPercent: settings.packetLossWarningPercent,
      failureThreshold: settings.failureThreshold,
    });

    const bandwidthIn = probe.snmp?.interfaces?.[0]?.inOctetsPerSecond ? (probe.snmp.interfaces[0].inOctetsPerSecond * 8) / 1_000_000 : null;
    const bandwidthOut = probe.snmp?.interfaces?.[0]?.outOctetsPerSecond ? (probe.snmp.interfaces[0].outOctetsPerSecond * 8) / 1_000_000 : null;

    const check = await tenantMonitorStore.recordCheck(organizationId, {
      deviceId: device.id,
      deviceName: device.name,
      ipAddress: device.ip,
      probe: kind,
      ok: probe.ok,
      latencyMs: probe.latencyMs,
      packetLossPercent: probe.packetLossPercent,
      bandwidthInMbps: bandwidthIn,
      bandwidthOutMbps: bandwidthOut,
      detail: probe.error ?? (probe.snmp ? `SNMP ${probe.snmp.hostname || device.ip}: ${probe.snmp.interfaces.length} active interfaces` : probe.tcp ? `TCP ${probe.tcp.port} ${probe.tcp.open ? "open" : "closed"}` : null),
      checkedAt: probe.checkedAt,
    });

    if (status !== device.status) await tenantMonitorStore.setDeviceStatus(organizationId, device.id, status);
    const history = await tenantMonitorStore.listChecks(organizationId, { deviceId: device.id, limit: 10 });

    let alert: NetworkAlert | null = null;
    let message: MonitorOutcome["message"] = null;
    let email: MonitorOutcome["email"] = null;

    const shouldCreateAlert = status !== "Online" && (status !== device.status || recentChecks.length === 0);
    if (shouldCreateAlert) {
      const severity = alertSeverity(status, probe.latencyMs, probe.packetLossPercent, settings);
      const payload = this.buildAlert(device, check, severity, status);
      alert = await tenantMonitorStore.saveAlert(organizationId, {
        deviceId: payload.device.id,
        deviceName: payload.device.name,
        ipAddress: payload.device.ip,
        severity: payload.severity,
        status: payload.status,
        summary: payload.summary,
        recommendation: payload.recommendation,
        evidence: payload.evidence,
        emailStatus: "pending",
      });

      if (options.notify !== false) {
        message = await synthesizeFaultMessage(
          {
            device: payload.device,
            severity: payload.severity,
            status: payload.status,
            probe: kind,
            checks: history,
            instruction: settings.aiInstruction,
            recommendation: payload.recommendation,
          },
          { provider: settings.aiProvider, model: settings.aiModel, apiKey: await tenantMonitorStore.getAiApiKey(organizationId) },
        );
        const smtp = await tenantMonitorStore.getSmtpConfig(organizationId) ?? smtpConfigFromEnv();
        const recipient = settings.adminEmail || process.env.ADMIN_EMAIL;
        if (smtp && recipient) {
          try {
            const acknowledgeUrl = getAcknowledgeUrl(organizationId, alert.id);
            const text = `${message.body}\n\nAcknowledge this alert: ${acknowledgeUrl}`;
            const sent = await sendFaultEmail(smtp, {
              to: recipient,
              subject: message.subject || renderTemplate("[Network Alert] {{deviceName}} is {{status}}", { deviceName: device.name, status }),
              text,
              html: buildNotificationHtml({
                title: message.subject || `${device.name} requires attention`,
                message: message.body,
                status,
                severity: payload.severity,
                deviceName: device.name,
                ipAddress: device.ip,
                acknowledgeUrl,
                footer: "Repeat email notifications stop when an administrator accepts this alert.",
              }),
            });
            email = { to: recipient, status: "sent", detail: sent.messageId };
            await tenantMonitorStore.updateAlertEmailStatus(organizationId, alert.id, "sent");
          } catch (error) {
            email = { to: recipient, status: "failed", detail: error instanceof Error ? error.message : "SMTP dispatch failed" };
            await tenantMonitorStore.updateAlertEmailStatus(organizationId, alert.id, `failed: ${email.detail ?? ""}`.slice(0, 200));
          }
        } else {
          email = { to: recipient ?? "", status: smtp ? "pending-recipient" : "not-configured" };
        }
      }
    }

    if (options.notify !== false && status === "Online" && status !== device.status) {
      const payload = this.buildAlert(device, check, "info", status);
      alert = await tenantMonitorStore.saveAlert(organizationId, {
        deviceId: payload.device.id,
        deviceName: payload.device.name,
        ipAddress: payload.device.ip,
        severity: payload.severity,
        status: payload.status,
        summary: payload.summary,
        recommendation: "No immediate action required. Continue monitoring for renewed latency, packet loss, or reachability failures.",
        evidence: payload.evidence,
        emailStatus: "pending",
      });
      message = await synthesizeFaultMessage(
        {
          device: payload.device,
          severity: "info",
          status,
          probe: kind,
          checks: history,
          instruction: settings.aiInstruction,
          recommendation: "Confirm the recovery is stable and continue normal monitoring.",
        },
        { provider: settings.aiProvider, model: settings.aiModel, apiKey: await tenantMonitorStore.getAiApiKey(organizationId) },
      );
      const smtp = await tenantMonitorStore.getSmtpConfig(organizationId) ?? smtpConfigFromEnv();
      const recipient = settings.adminEmail || process.env.ADMIN_EMAIL;
      if (smtp && recipient) {
        try {
          const sent = await sendFaultEmail(smtp, {
            to: recipient,
            subject: message.subject || `[Network Recovered] ${device.name} is Online`,
            text: message.body,
            html: buildNotificationHtml({
              title: message.subject || `${device.name} has recovered`,
              message: message.body,
              status: "Online",
              severity: "info",
              deviceName: device.name,
              ipAddress: device.ip,
              footer: "This recovery notification was sent automatically by NetMoni.",
            }),
          });
          email = { to: recipient, status: "sent", detail: sent.messageId };
          await tenantMonitorStore.updateAlertEmailStatus(organizationId, alert.id, "sent");
        } catch (error) {
          email = { to: recipient, status: "failed", detail: error instanceof Error ? error.message : "SMTP dispatch failed" };
          await tenantMonitorStore.updateAlertEmailStatus(organizationId, alert.id, `failed: ${email.detail ?? ""}`.slice(0, 200));
        }
      } else {
        email = { to: recipient ?? "", status: smtp ? "pending-recipient" : "not-configured" };
      }
    }

    if (!alert && status !== "Online") {
      alert = await tenantMonitorStore.getActiveAlertForDevice(organizationId, device.id);
    }

    const command = kind === "ping"
      ? `${process.platform === "win32" ? "ping" : "ping"} ${process.platform === "win32" ? "-n 1 -w 2000" : "-c 1 -W 2"} ${device.ip}`
      : kind === "tcp"
        ? `TCP probe ${device.ip}:${options.port ?? 80}`
        : `SNMP probe ${device.ip}`;
    const output = probe.error ?? check.detail ?? `${probe.ok ? "Response received" : "No response"}; latency=${probe.latencyMs ?? "n/a"} ms; packet loss=${probe.packetLossPercent}%`;
    const outcome = { deviceId: device.id, deviceName: device.name, ip: device.ip, probe: kind, ok: probe.ok, latencyMs: probe.latencyMs, packetLossPercent: probe.packetLossPercent, bandwidthInMbps: bandwidthIn, bandwidthOutMbps: bandwidthOut, status, alert, message, email, command, output };
    await triggerRealtime(organizationId, "probe.completed", outcome);
    if (alert) await triggerRealtime(organizationId, "notification.created", { alert, outcome });
    return outcome;
  }

  async testDevice(organizationId: string, device: NetworkDevice, kind: CheckRow["probe"], options: { port?: number; community?: string } = {}): Promise<MonitorOutcome> {
    return this.processCheck(organizationId, device, kind, { ...options, notify: false });
  }

  async runCycle(
    organizationId: string,
    probe: CheckRow["probe"] = "ping",
    options: { notify?: boolean } = {},
  ): Promise<MonitorOutcome[]> {
    const devices = await tenantMonitorStore.listDevices(organizationId);
    const outcomes: MonitorOutcome[] = [];
    for (const device of devices) {
      try {
        outcomes.push(await this.processCheck(organizationId, device, probe, { notify: options.notify !== false }));
      } catch (error) {
        outcomes.push({
          deviceId: device.id, deviceName: device.name, ip: device.ip, probe, ok: false, latencyMs: null, packetLossPercent: 100, bandwidthInMbps: null, bandwidthOutMbps: null,
          status: device.status, alert: null, message: null, email: null,
          ...(error instanceof Error ? { } : {}),
        });
        void error;
      }
    }
    return outcomes;
  }

  newExecutionId() { return randomUUID(); }
}

export const networkMonitor = new NetworkMonitor();
