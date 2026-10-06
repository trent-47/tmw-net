import { NextResponse } from "next/server";
import { sessionWorkspace } from "@/auth/store";
import { tenantMonitorStore } from "@/core/monitoring/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const settings = await tenantMonitorStore.getSettings(await sessionWorkspace(request));
    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load settings" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const organizationId = await sessionWorkspace(request);
    if (body.aiApiKey !== undefined && typeof body.aiApiKey !== "string") {
      return NextResponse.json({ error: "AI API key must be text" }, { status: 400 });
    }
    if (typeof body.aiApiKey === "string" && body.aiApiKey.length > 1000) {
      return NextResponse.json({ error: "AI API key is too long" }, { status: 400 });
    }
    if (body.smtpPassword !== undefined && typeof body.smtpPassword !== "string") {
      return NextResponse.json({ error: "SMTP password must be text" }, { status: 400 });
    }
    if (typeof body.smtpPassword === "string" && body.smtpPassword.length > 1000) {
      return NextResponse.json({ error: "SMTP password is too long" }, { status: 400 });
    }
    const settings = await tenantMonitorStore.saveSettings(organizationId, {
      ...(body.intervalSeconds !== undefined ? { intervalSeconds: Number(body.intervalSeconds) } : {}),
      ...(body.failureThreshold !== undefined ? { failureThreshold: Number(body.failureThreshold) } : {}),
      ...(body.latencyWarningMs !== undefined ? { latencyWarningMs: Number(body.latencyWarningMs) } : {}),
      ...(body.packetLossWarningPercent !== undefined ? { packetLossWarningPercent: Number(body.packetLossWarningPercent) } : {}),
      ...(body.bandwidthWarningMbps !== undefined ? { bandwidthWarningMbps: Number(body.bandwidthWarningMbps) } : {}),
      ...(body.adminEmail !== undefined ? { adminEmail: String(body.adminEmail) } : {}),
      ...(body.aiProvider !== undefined ? { aiProvider: String(body.aiProvider) } : {}),
      ...(body.aiModel !== undefined ? { aiModel: String(body.aiModel) } : {}),
      ...(body.aiInstruction !== undefined ? { aiInstruction: String(body.aiInstruction) } : {}),
    });
    const provider = String(body.aiProvider ?? settings.aiProvider).toLowerCase();
    const model = String(body.aiModel ?? settings.aiModel);
    if (body.aiProvider !== undefined || body.aiModel !== undefined || body.aiApiKey !== undefined || body.removeAiApiKey === true) {
      await tenantMonitorStore.saveAiProviderSettings(
        organizationId,
        provider,
        model,
        typeof body.aiApiKey === "string" ? body.aiApiKey : undefined,
        body.removeAiApiKey === true,
      );
    }
    const smtpInput = {
      ...(body.smtpHost !== undefined ? { smtpHost: String(body.smtpHost).trim() || "smtp.gmail.com" } : {}),
      ...(body.smtpPort !== undefined ? { smtpPort: Math.max(1, Math.min(65535, Math.floor(Number(body.smtpPort) || 465))) } : {}),
      ...(body.smtpSecure !== undefined ? { smtpSecure: body.smtpSecure === true } : {}),
      ...(body.smtpUser !== undefined ? { smtpUser: String(body.smtpUser).trim() } : {}),
      ...(body.smtpFrom !== undefined ? { smtpFrom: String(body.smtpFrom).trim() } : {}),
    };
    if (Object.keys(smtpInput).length || body.smtpPassword !== undefined || body.removeSmtpPassword === true) {
      await tenantMonitorStore.saveSmtpSettings(
        organizationId,
        smtpInput,
        typeof body.smtpPassword === "string" ? body.smtpPassword : undefined,
        body.removeSmtpPassword === true,
      );
    }
    const updatedSettings = await tenantMonitorStore.getSettings(organizationId);
    return NextResponse.json({ settings: updatedSettings });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save settings" }, { status: 400 });
  }
}
