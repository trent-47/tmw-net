import { NextResponse } from "next/server";
import { synthesizeFaultMessage, type AiFaultContext } from "@/core/monitoring/ai";
import { sessionWorkspace } from "@/auth/store";
import { tenantMonitorStore } from "@/core/monitoring/store";
import { alertSeverity, type AlertSeverity } from "@/core/monitoring/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      deviceName?: string;
      ipAddress?: string;
      status?: string;
      severity?: AlertSeverity;
      probe?: string;
      instruction?: string;
      provider?: string;
      model?: string;
    };
    const organizationId = await sessionWorkspace(request);

    let deviceContext: AiFaultContext["device"] = { name: body.deviceName ?? "Unknown device", ip: body.ipAddress ?? "0.0.0.0", type: "router", subnet: "", mac: "" };
    let checks: AiFaultContext["checks"] = [];
    if (body.ipAddress || body.deviceName) {
      const devices = await tenantMonitorStore.listDevices(organizationId);
      const device = devices.find((entry) => entry.ip === body.ipAddress || entry.name === body.deviceName);
      if (device) {
        deviceContext = { name: device.name, ip: device.ip, type: device.type, subnet: device.subnet, mac: device.mac };
        checks = await tenantMonitorStore.listChecks(organizationId, { deviceId: device.id, limit: 10 });
      }
    }

    const settings = await tenantMonitorStore.getSettings(organizationId);
    const status = body.status ?? "Offline";
    const severity = body.severity ?? alertSeverity(status === "Offline" ? "Offline" : "Warning", checks[0]?.latencyMs ?? null, checks[0]?.packetLossPercent ?? 0, settings);

    const message = await synthesizeFaultMessage(
      {
        device: deviceContext,
        severity,
        status,
        probe: body.probe ?? "ping",
        checks,
        instruction: body.instruction ?? settings.aiInstruction,
      },
      {
        provider: body.provider ?? settings.aiProvider,
        model: body.model ?? settings.aiModel,
        apiKey: await tenantMonitorStore.getAiApiKey(organizationId),
      },
    );
    return NextResponse.json({ message });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI synthesis failed" }, { status: 500 });
  }
}
