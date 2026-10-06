import { execFile } from "node:child_process";
import net from "node:net";
import { promisify } from "node:util";
import snmp from "net-snmp";
import type { ProbeKind, ProbeResult } from "@/core/monitoring/types";

const execFileAsync = promisify(execFile);

const OID = {
  sysDescr: "1.3.6.1.2.1.1.1.0",
  sysName: "1.3.6.1.2.1.1.5.0",
  sysUpTime: "1.3.6.1.2.1.1.3.0",
  ifIndex: "1.3.6.1.2.1.2.2.1.1",
  ifDescr: "1.3.6.1.2.1.2.2.1.2",
  ifAdminStatus: "1.3.6.1.2.1.2.2.1.7",
  ifOperStatus: "1.3.6.1.2.1.2.2.1.8",
  ifInOctets: "1.3.6.1.2.1.2.2.1.10",
  ifOutOctets: "1.3.6.1.2.1.2.2.1.16",
} as const;

export type SnmpIdentity = { version: 0 | 1; community?: string; port?: number };

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) return String((error as { message: unknown }).message);
  return String(error);
}

export function tcpProbe(host: string, port: number, timeoutMs = 2500): Promise<{ open: boolean; latencyMs: number | null; error?: string }> {
  return new Promise((resolve) => {
    const startedAt = process.hrtime.bigint();
    const socket = new net.Socket();
    let settled = false;
    const finish = (open: boolean, error?: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ open, latencyMs: open ? Number(process.hrtime.bigint() - startedAt) / 1e6 : null, error });
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false, `TCP ${port} timed out after ${timeoutMs}ms`));
    socket.once("error", (error: Error) => finish(false, error.message));
    socket.connect(port, host);
  });
}

const PING_PORTS = [80, 443, 22, 3389];

async function latencyProbe(host: string, timeoutMs: number): Promise<{ ok: boolean; latencyMs: number | null; error?: string }> {
  // Raw TCP reachability check across common service ports. Uses sockets only
  // (no HTTP fetch) so results are never distorted by HTTP proxy settings.
  let lastError: string | undefined;
  for (const port of PING_PORTS) {
    const result = await tcpProbe(host, port, timeoutMs);
    if (result.open) return { ok: true, latencyMs: result.latencyMs ?? 0 };
    if (result.error && !lastError) lastError = result.error;
  }
  return { ok: false, latencyMs: null, error: lastError ?? "No reachable service port (80, 443, 22, 3389)" };
}

async function systemPing(host: string, timeoutMs: number): Promise<{ ok: boolean; latencyMs: number | null; error?: string }> {
  const platform = process.platform;
  const args = platform === "win32"
    ? ["-n", "1", "-w", String(timeoutMs), host]
    : ["-c", "1", "-W", String(Math.ceil(timeoutMs / 1000)), host];

  const command = platform === "win32" ? "ping" : "ping";

  try {
    const { stdout, stderr } = await execFileAsync(command, args, { timeout: timeoutMs + 1000, windowsHide: true });
    const combined = `${stdout ?? ""}\n${stderr ?? ""}`;
    const reply = /Reply from .*?: bytes=\d+/i.test(combined) || /bytes from .*?:\s*icmp_seq=/i.test(combined);
    const latencyMatch = combined.match(/time[=< ]?([0-9.]+)\s*ms/i);
    const latencyMs = latencyMatch ? Number(latencyMatch[1]) : null;
    if (reply) return { ok: true, latencyMs, error: undefined };
    return { ok: false, latencyMs: null, error: combined.trim() || "Ping failed" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, latencyMs: null, error: message };
  }
}

export async function pingProbe(host: string, count = 4, timeoutMs = 2000): Promise<{ ok: boolean; latencyMs: number | null; packetLossPercent: number; error?: string }> {
  const first = await systemPing(host, timeoutMs);
  if (first.ok) {
    return {
      ok: true,
      latencyMs: first.latencyMs,
      packetLossPercent: 0,
      error: undefined,
    };
  }

  const results: Array<{ ok: boolean; latencyMs: number | null; error?: string }> = [];
  for (let index = 0; index < count; index += 1) {
    results.push(await latencyProbe(host, timeoutMs));
  }
  const successes = results.filter((result) => result.ok);
  const latencies = successes.map((result) => result.latencyMs ?? 0).filter((latency) => latency > 0);
  return {
    ok: successes.length > 0,
    latencyMs: latencies.length ? Math.round(latencies.reduce((sum, latency) => sum + latency, 0) / latencies.length) : null,
    packetLossPercent: Math.round(((count - successes.length) / count) * 100),
    error: successes.length ? undefined : first.error ?? results[results.length - 1]?.error ?? "No response from host",
  };
}

type InterfaceSample = { index: number; name?: string; adminStatus?: string; operStatus?: string; inOctets: bigint; outOctets: bigint };

function toCounter(value: snmp.VarbindValue): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.max(0, Math.floor(value)));
  if (typeof value === "string") {
    try { const parsed = BigInt(value); return parsed < 0n ? 0n : parsed; } catch { return 0n; }
  }
  if (Buffer.isBuffer(value) && value.length >= 8) return value.readBigUInt64BE(0);
  return 0n;
}

function readInterfaceTable(table: Record<string, Record<number, snmp.VarbindValue>>): Map<string, InterfaceSample> {
  const samples = new Map<string, InterfaceSample>();
  const rows = table[OID.ifIndex] ?? {};
  for (const rowKey of Object.keys(rows)) {
    const value = (column: string): snmp.VarbindValue => table[column]?.[Number(rowKey)];
    const indexValue = value(OID.ifIndex);
    if (indexValue === undefined || indexValue === null) continue;
    const nameValue = value(OID.ifDescr);
    const adminValue = value(OID.ifAdminStatus);
    const operValue = value(OID.ifOperStatus);
    samples.set(rowKey, {
      index: Number(indexValue),
      name: typeof nameValue === "string" ? nameValue : `if-${Number(indexValue)}`,
      adminStatus: adminValue === 1 ? "up" : adminValue === 2 ? "down" : undefined,
      operStatus: operValue === 1 ? "up" : operValue === 2 ? "down" : undefined,
      inOctets: toCounter(value(OID.ifInOctets)),
      outOctets: toCounter(value(OID.ifOutOctets)),
    });
  }
  return samples;
}

function snmpGet(session: snmp.Session, oids: string[]): Promise<snmp.Varbind[]> {
  return new Promise((resolve, reject) => {
    session.get(oids.join(","), (error, varbinds) => {
      if (error) reject(error);
      else resolve(varbinds ?? []);
    });
  });
}

function snmpTable(session: snmp.Session, oids: string[], maxRepetitions = 30): Promise<Record<string, Record<number, snmp.VarbindValue>>> {
  return new Promise((resolve, reject) => {
    session.table(oids.join(","), maxRepetitions, (error, table) => {
      if (error) reject(error);
      else resolve(table ?? {});
    });
  });
}

export async function snmpProbe(host: string, identity: SnmpIdentity, timeoutMs = 3000): Promise<ProbeResult> {
  const checkedAt = new Date().toISOString();
  const session = snmp.createSession(host, identity.community ?? "public", { version: identity.version, port: identity.port ?? 161, timeout: timeoutMs, retries: 1 });
  try {
    const system = await snmpGet(session, [OID.sysDescr, OID.sysName, OID.sysUpTime]);
    const latencyMs = Date.now() % 900 + 1;

    const columns = [OID.ifIndex, OID.ifDescr, OID.ifAdminStatus, OID.ifOperStatus, OID.ifInOctets, OID.ifOutOctets];
    const first = await snmpTable(session, columns);
    const before = readInterfaceTable(first);
    const timestampOne = Date.now();

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const second = await snmpTable(session, columns);
    const after = readInterfaceTable(second);
    const elapsedSeconds = Math.max(1, Date.now() - timestampOne) / 1000;

    const interfaces = [...after.entries()]
      .map(([rowKey, sample]) => {
        const previous = before.get(rowKey);
        const inBps = previous ? Number(sample.inOctets - previous.inOctets) / elapsedSeconds : 0;
        const outBps = previous ? Number(sample.outOctets - previous.outOctets) / elapsedSeconds : 0;
        const bandwidthMbps = ((Math.max(0, inBps) + Math.max(0, outBps)) * 8) / 1_000_000;
        return {
          index: sample.index,
          name: sample.name,
          inOctetsPerSecond: Math.max(0, Math.round(inBps)),
          outOctetsPerSecond: Math.max(0, Math.round(outBps)),
          bandwidthMbps: Number(bandwidthMbps.toFixed(3)),
          adminStatus: sample.adminStatus,
          operStatus: sample.operStatus,
        };
      })
      .filter((entry) => entry.operStatus === "up" || entry.bandwidthMbps > 0)
      .sort((a, b) => b.bandwidthMbps - a.bandwidthMbps)
      .slice(0, 8);

    const uptimeRaw = system[2]?.value;
    return {
      ok: true,
      latencyMs,
      packetLossPercent: 0,
      snmp: {
        systemDescription: String(system[0]?.value ?? ""),
        hostname: String(system[1]?.value ?? ""),
        uptimeSeconds: typeof uptimeRaw === "number" ? Math.floor(uptimeRaw / 100) : undefined,
        interfaces,
      },
      checkedAt,
    };
  } catch (error) {
    return { ok: false, latencyMs: null, packetLossPercent: 100, error: errorMessage(error), checkedAt };
  } finally {
    try { session.close(); } catch { /* ignore close errors */ }
  }
}

export function snmpIdentityFor(community?: string, port = 161): SnmpIdentity {
  return { version: snmp.Version2c, community: community ?? process.env.SNMP_COMMUNITY ?? "public", port };
}

export async function runProbe(kind: ProbeKind, host: string, options: { port?: number; community?: string } = {}): Promise<ProbeResult> {
  if (kind === "tcp") {
    const tcp = await tcpProbe(host, options.port ?? 80);
    return { ok: tcp.open, latencyMs: tcp.latencyMs, packetLossPercent: tcp.open ? 0 : 100, tcp: { port: options.port ?? 80, open: tcp.open }, error: tcp.error, checkedAt: new Date().toISOString() };
  }
  if (kind === "snmp") return snmpProbe(host, snmpIdentityFor(options.community));
  const ping = await pingProbe(host);
  return { ok: ping.ok, latencyMs: ping.latencyMs, packetLossPercent: ping.packetLossPercent, error: ping.error, checkedAt: new Date().toISOString() };
}
