import nodemailer from "nodemailer";

export type SmtpConfig = { host: string; port: number; secure: boolean; user: string; password: string; from?: string };

export function smtpConfigFromEnv(): SmtpConfig | null {
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  if (!user || !password) return null;
  return {
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: (process.env.SMTP_SECURE ?? "true") === "true",
    user,
    password,
    from: process.env.SMTP_FROM ?? user,
  };
}

export function renderTemplate(template: string, values: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key: string) => {
    const resolved = key.split(".").reduce<unknown>((acc, part) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[part] : undefined), values);
    return resolved === undefined || resolved === null ? "" : String(resolved);
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderInlineMarkdown(value: string): string {
  let rendered = escapeHtml(value);
  rendered = rendered.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" style="color:#2563eb;text-decoration:underline">$1</a>');
  rendered = rendered.replace(/`([^`]+)`/g, '<code style="padding:2px 5px;border-radius:4px;background:#e2e8f0;color:#334155;font-family:monospace">$1</code>');
  rendered = rendered.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  rendered = rendered.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  rendered = rendered.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  rendered = rendered.replace(/_([^_]+)_/g, "<em>$1</em>");
  return rendered;
}

export function renderMarkdownHtml(markdown: string): string {
  const source = markdown.replace(/\r\n?/g, "\n").trim();
  if (!source) return "";
  const lines = source.split("\n");
  const html: string[] = [];
  let paragraph: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p style="margin:0 0 12px;color:#334155;line-height:1.65">${renderInlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!listType || !listItems.length) return;
    html.push(`<${listType} style="margin:8px 0 16px;padding-left:22px;color:#334155;line-height:1.65">${listItems.map((item) => `<li style="margin:6px 0;padding-left:3px">${renderInlineMarkdown(item)}</li>`).join("")}</${listType}>`);
    listType = null;
    listItems = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = trimmed.match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      html.push(`<h2 style="margin:18px 0 8px;font-size:16px;line-height:1.35;color:#0f172a">${renderInlineMarkdown(heading[1])}</h2>`);
      continue;
    }
    const unordered = trimmed.match(/^[-*+]\s+(.+)$/);
    const ordered = trimmed.match(/^(\d+)[.)]\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const nextListType = ordered ? "ol" : "ul";
      if (listType && listType !== nextListType) flushList();
      listType = nextListType;
      listItems.push((unordered?.[1] ?? ordered?.[2] ?? "").trim());
      continue;
    }
    if (trimmed.startsWith(">")) {
      flushParagraph();
      flushList();
      html.push(`<blockquote style="margin:12px 0;padding:10px 14px;border-left:4px solid #93c5fd;background:#eff6ff;color:#334155">${renderInlineMarkdown(trimmed.replace(/^>\s?/, ""))}</blockquote>`);
      continue;
    }
    flushList();
    paragraph.push(trimmed);
  }
  flushParagraph();
  flushList();
  return html.join("");
}

export function buildNotificationHtml(input: {
  title: string;
  message: string;
  status?: string;
  severity?: string;
  deviceName?: string;
  ipAddress?: string;
  acknowledgeUrl?: string;
  footer?: string;
}): string {
  const detailRows = [
    input.deviceName ? ["Device", input.deviceName] : null,
    input.ipAddress ? ["IP address", input.ipAddress] : null,
    input.status ? ["Status", input.status] : null,
    input.severity ? ["Severity", input.severity.toUpperCase()] : null,
  ].filter((row): row is [string, string] => row !== null);
  const details = detailRows.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">${detailRows.map(([label, value]) =>
      `<tr><td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#64748b;width:120px;font-size:13px">${escapeHtml(label)}</td><td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#0f172a;font-size:14px;font-weight:700">${escapeHtml(value)}</td></tr>`
    ).join("")}</table>`
    : "";
  const action = input.acknowledgeUrl
    ? `<p style="margin:24px 0 8px"><a href="${escapeHtml(input.acknowledgeUrl)}" style="display:inline-block;padding:13px 20px;border-radius:8px;background:#16a34a;color:#ffffff;text-decoration:none;font-weight:800">Accept and acknowledge this alert</a></p><p style="margin:8px 0 0;color:#64748b;font-size:12px">Clicking this button confirms the administrator has seen the device fault and stops repeat email notifications for this incident.</p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 12px"><tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #dbe3ef">
  <tr><td style="padding:20px 28px;background:#0f172a;color:#ffffff"><strong style="font-size:18px">NetMoni</strong><span style="float:right;color:#a7f3d0;font-size:12px;padding-top:4px">Network Operations</span></td></tr>
  <tr><td style="padding:28px">
  <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3">${escapeHtml(input.title)}</h1>
  ${details}
  <div style="font-size:15px;line-height:1.65;color:#334155">${renderMarkdownHtml(input.message)}</div>
  ${action}
  </td></tr>
  <tr><td style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e5e7eb;color:#64748b;font-size:12px">${escapeHtml(input.footer ?? "Sent automatically by NetMoni monitoring.")}</td></tr>
  </table></td></tr></table></body></html>`;
}

export async function sendFaultEmail(config: SmtpConfig, input: { to: string; subject: string; text: string; html?: string }): Promise<{ messageId: string; accepted: string[] }> {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
  });
  try {
    const info = await transporter.sendMail({
      from: config.from ?? config.user,
      to: input.to,
      subject: input.subject,
      text: input.text,
      ...(input.html ? { html: input.html } : {}),
    });
    return { messageId: info.messageId, accepted: (info.accepted ?? []).map((entry) => (typeof entry === "string" ? entry : String(entry))) };
  } finally {
    transporter.close();
  }
}
