import { createHmac, timingSafeEqual } from "node:crypto";

function secret(): string {
  const value = process.env.NETMONI_ENCRYPTION_KEY ?? process.env.DATABASE_URL ?? "";
  if (!value) throw new Error("Alert acknowledgement signing secret is not configured");
  return value;
}

export function createAcknowledgeToken(organizationId: string, alertId: string): string {
  const payload = Buffer.from(`${organizationId}.${alertId}`).toString("base64url");
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function readAcknowledgeToken(token: string, alertId: string): { organizationId: string } | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const expected = createHmac("sha256", secret()).update(parts[0]).digest("base64url");
  const actual = Buffer.from(parts[1]);
  const wanted = Buffer.from(expected);
  if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) return null;
  try {
    const decoded = Buffer.from(parts[0], "base64url").toString("utf8");
    const separator = decoded.lastIndexOf(".");
    if (separator < 1) return null;
    const organizationId = decoded.slice(0, separator);
    const tokenAlertId = decoded.slice(separator + 1);
    return tokenAlertId === alertId ? { organizationId } : null;
  } catch {
    return null;
  }
}

export function getAcknowledgeUrl(organizationId: string, alertId: string): string {
  const base = (process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const token = createAcknowledgeToken(organizationId, alertId);
  return `${base}/api/alerts/${encodeURIComponent(alertId)}/acknowledge?token=${encodeURIComponent(token)}`;
}
