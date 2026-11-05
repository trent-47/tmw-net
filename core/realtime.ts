import Pusher from "pusher";

let server: Pusher | null | undefined;

function getPusher(): Pusher | null {
  if (server !== undefined) return server;
  const appId = process.env.PUSHER_APP_ID;
  const key = process.env.PUSHER_KEY ?? process.env.NEXT_PUBLIC_PUSHER_KEY;
  const secret = process.env.PUSHER_SECRET;
  const cluster = process.env.PUSHER_CLUSTER ?? process.env.NEXT_PUBLIC_PUSHER_CLUSTER ?? "mt1";
  if (!appId || !key || !secret) {
    server = null;
    return server;
  }
  server = new Pusher({ appId, key, secret, cluster, useTLS: true });
  return server;
}

export async function triggerRealtime(
  organizationId: string,
  event: string,
  data: Record<string, unknown>,
): Promise<void> {
  const pusher = getPusher();
  if (!pusher) return;
  await pusher.trigger(`netmoni-org-${organizationId}`, event, data);
}
