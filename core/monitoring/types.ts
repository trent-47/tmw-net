export type DeviceType = "router" | "switch" | "server";
export type DeviceStatus = "Online" | "Warning" | "Offline";

export type NetworkDevice = {
  id: string;
  name: string;
  ip: string;
  subnet: string;
  mac: string;
  type: DeviceType;
  status: DeviceStatus;
  createdAt: string;
};

export type ProbeKind = "ping" | "tcp" | "snmp";

export type ProbeResult = {
  ok: boolean;
  latencyMs: number | null;
  packetLossPercent: number;
  snmp?: {
    systemDescription?: string;
    uptimeSeconds?: number;
    hostname?: string;
    interfaces: Array<{
      index: number;
      name?: string;
      inOctetsPerSecond: number;
      outOctetsPerSecond: number;
      bandwidthMbps: number;
      adminStatus?: string;
      operStatus?: string;
    }>;
  };
  tcp?: { port: number; open: boolean };
  error?: string;
  checkedAt: string;
};

export type CheckRow = {
  id: string;
  deviceId: string;
  deviceName: string;
  ipAddress: string;
  probe: ProbeKind;
  ok: boolean;
  latencyMs: number | null;
  packetLossPercent: number;
  bandwidthInMbps: number | null;
  bandwidthOutMbps: number | null;
  detail: string | null;
  checkedAt: string;
};

export type AlertSeverity = "critical" | "warning" | "info";

export type NetworkAlert = {
  id: string;
  deviceId: string;
  deviceName: string;
  ipAddress: string;
  severity: AlertSeverity;
  status: string;
  summary: string;
  recommendation: string;
  evidence: Record<string, unknown>;
  emailStatus: string;
  createdAt: string;
};

export type MonitoringSettings = {
  organizationId: string;
  intervalSeconds: number;
  failureThreshold: number;
  latencyWarningMs: number;
  packetLossWarningPercent: number;
  bandwidthWarningMbps: number;
  adminEmail: string;
  aiProvider: string;
  aiModel: string;
  aiInstruction: string;
  aiApiKeyConfigured: boolean;
  aiProviderConfigurations: Array<{ provider: string; model: string; apiKeyConfigured: boolean }>;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpFrom: string;
  smtpPasswordConfigured: boolean;
  updatedAt: string;
};

export const DEVICE_STATUS: DeviceStatus[] = ["Online", "Warning", "Offline"];
export const DEVICE_TYPES: DeviceType[] = ["router", "switch", "server"];
export const PROBE_KINDS: ProbeKind[] = ["ping", "tcp", "snmp"];

export function alertSeverity(status: DeviceStatus, latencyMs: number | null, packetLossPercent: number, settings: { latencyWarningMs: number; packetLossWarningPercent: number }): AlertSeverity {
  if (status === "Offline") return "critical";
  if (status === "Warning") return "warning";
  if (latencyMs !== null && latencyMs > settings.latencyWarningMs) return "warning";
  if (packetLossPercent >= settings.packetLossWarningPercent) return "warning";
  return "info";
}
