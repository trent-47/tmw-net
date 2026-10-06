import { networkMonitor } from "@/core/monitoring/monitor";

class MonitorScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private reportedNoDevices = false;
  private readonly lastRunAt = new Map<string, number>();

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      // Organizations with devices registered in the shared Postgres database
      // are discovered from the network_devices table itself.
      const { db } = await import("@/db/client");
      const { networkDevices } = await import("@/db/schema");
      const rows = await db().selectDistinct({ organizationId: networkDevices.organizationId }).from(networkDevices);
      const { tenantMonitorStore } = await import("@/core/monitoring/store");
      if (rows.length === 0) {
        if (!this.reportedNoDevices) console.info("[monitor] idle: no devices are registered in the monitoring database");
        this.reportedNoDevices = true;
        return;
      }
      this.reportedNoDevices = false;
      const activeOrganizations = new Set(rows.map((row) => row.organizationId));
      for (const organizationId of this.lastRunAt.keys()) {
        if (!activeOrganizations.has(organizationId)) this.lastRunAt.delete(organizationId);
      }
      for (const row of rows) {
        const organizationId = row.organizationId;
        const settings = await tenantMonitorStore.getSettings(organizationId);
        const now = Date.now();
        const intervalMs = Math.max(60_000, settings.intervalSeconds * 1000);
        const lastRun = this.lastRunAt.get(organizationId);
        if (lastRun !== undefined && now - lastRun < intervalMs) continue;
        this.lastRunAt.set(organizationId, now);
        const outcomes = await networkMonitor.runCycle(organizationId, "ping");
        console.info(`[monitor] ping cycle org=${organizationId} devices=${outcomes.length} interval=${settings.intervalSeconds}s`);
        for (const outcome of outcomes) {
          const latency = outcome.latencyMs === null ? "n/a" : `${outcome.latencyMs}ms`;
          const detail = outcome.ok ? "reply received" : outcome.alert?.summary ?? "no reply";
          const message = `[monitor] ${outcome.status.toUpperCase()} ${outcome.deviceName} (${outcome.ip}) reachable=${outcome.ok} latency=${latency} loss=${outcome.packetLossPercent}% detail=${detail}`;
          if (outcome.ok && outcome.status === "Online") console.info(message);
          else console.warn(message);
        }
      }
    } catch (error) {
      console.error("Network monitoring scheduler cycle failed", error);
    } finally {
      this.running = false;
    }
  }

  start() {
    if (this.timer || process.env.NETMONI_SCHEDULER === "off") return;
    const configuredTickMs = Number(process.env.NETMONI_POLL_MS ?? 5_000);
    const intervalMs = Math.min(5_000, Math.max(1_000, Number.isFinite(configuredTickMs) ? configuredTickMs : 5_000));
    console.info(`[monitor] scheduler started; checking due organizations every ${intervalMs}ms`);
    void this.tick();
    this.timer = setInterval(() => { void this.tick(); }, intervalMs);
    if (typeof this.timer.unref === "function") this.timer.unref();
  }
}

export const monitorScheduler = new MonitorScheduler();
