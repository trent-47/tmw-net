import { NextResponse } from "next/server";
import { readAcknowledgeToken } from "@/core/alert-ack";
import { tenantMonitorStore } from "@/core/monitoring/store";
import { triggerRealtime } from "@/core/realtime";

export const dynamic = "force-dynamic";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Acknowledgement token is required" }, { status: 400 });
  const verified = readAcknowledgeToken(token, id);
  if (!verified) return NextResponse.json({ error: "Invalid acknowledgement link" }, { status: 403 });
  const alert = await tenantMonitorStore.acknowledgeAlert(verified.organizationId, id);
  if (!alert) return NextResponse.json({ error: "Alert not found" }, { status: 404 });
  await triggerRealtime(verified.organizationId, "notification.acknowledged", { alert });
  return new NextResponse(
    `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a"><main style="max-width:560px;margin:48px auto;background:#fff;border:1px solid #dbe3ef;border-radius:12px;padding:28px"><div style="width:48px;height:48px;border-radius:50%;background:#dcfce7;color:#16a34a;text-align:center;line-height:48px;font-size:26px">&#10003;</div><h1 style="margin:16px 0 8px">Alert acknowledged</h1><p style="line-height:1.6;color:#334155"><strong>${escapeHtml(alert.deviceName)}</strong> (${escapeHtml(alert.ipAddress)}) has been marked as seen by an administrator.</p><p style="line-height:1.6;color:#64748b">Further repeat email notifications for this incident have stopped.</p></main></body></html>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}
