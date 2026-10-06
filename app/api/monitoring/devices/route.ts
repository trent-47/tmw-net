import { NextResponse } from "next/server";
import { sessionWorkspace } from "@/auth/store";
import { networkMonitor } from "@/core/monitoring/monitor";
import { tenantMonitorStore } from "@/core/monitoring/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const devices = await tenantMonitorStore.listDevices(await sessionWorkspace(request));
    return NextResponse.json({ devices });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load devices" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { name?: string; ip?: string; subnet?: string; mac?: string; type?: string };
    if (!body.name?.trim() || !body.ip?.trim()) return NextResponse.json({ error: "Device name and IP address are required" }, { status: 400 });
    const organizationId = await sessionWorkspace(request);
    const device = await tenantMonitorStore.createDevice(organizationId, { name: body.name.trim(), ip: body.ip.trim(), subnet: body.subnet, mac: body.mac, type: body.type });
    const outcome = await networkMonitor.testDevice(organizationId, device, "ping");
    return NextResponse.json({ device: { ...device, status: outcome.status }, outcome }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not add device" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const deviceId = url.searchParams.get("id");
    const ip = url.searchParams.get("ip");
    if (!deviceId && !ip) return NextResponse.json({ error: "Device id or ip is required" }, { status: 400 });
    const organizationId = await sessionWorkspace(request);
    const devices = await tenantMonitorStore.listDevices(organizationId);
    const target = devices.find((device) => (deviceId ? device.id === deviceId : device.ip === ip));
    if (!target) return NextResponse.json({ error: "Device not found" }, { status: 404 });
    await tenantMonitorStore.deleteDevice(organizationId, target.id);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not remove device" }, { status: 400 });
  }
}
