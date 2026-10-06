import type { AlertSeverity, CheckRow, NetworkDevice } from "@/core/monitoring/types";

export type AiFaultContext = {
  device: Pick<NetworkDevice, "name" | "ip" | "type" | "subnet" | "mac">;
  severity: AlertSeverity;
  status: string;
  probe: string;
  checks: Pick<CheckRow, "ok" | "latencyMs" | "packetLossPercent" | "bandwidthInMbps" | "bandwidthOutMbps" | "detail" | "checkedAt">[];
  instruction?: string;
  recommendation?: string;
};

export type AiConfig = { provider: string; model?: string; apiKey?: string; baseUrl?: string };

const DEFAULT_INSTRUCTION = "Write a concise, professional network fault notification. Include the affected device, IP, severity, evidence and recommended action.";

function providerEndpoint(provider: string, baseUrl?: string): { url: string; style: "google" | "openai" | "anthropic" | "mistral" } {
  const custom = baseUrl?.trim();
  switch (provider.toLowerCase()) {
    case "gemini":
      return { url: custom ?? "https://generativelanguage.googleapis.com/v1beta", style: "google" };
    case "groq":
      return { url: custom ?? "https://api.groq.com/openai/v1", style: "openai" };
    case "openai":
      return { url: custom ?? "https://api.openai.com/v1", style: "openai" };
    case "anthropic":
      return { url: custom ?? "https://api.anthropic.com/v1", style: "anthropic" };
    case "mistral":
      return { url: custom ?? "https://api.mistral.ai/v1", style: "mistral" };
    default:
      return { url: custom ?? "https://api.openai.com/v1", style: "openai" };
  }
}

function providerKeyEnv(provider: string): string {
  switch (provider.toLowerCase()) {
    case "gemini": return "GEMINI_API_KEY";
    case "groq": return "GROQ_API_KEY";
    case "openai": return "OPENAI_API_KEY";
    case "anthropic": return "ANTHROPIC_API_KEY";
    case "mistral": return "MISTRAL_API_KEY";
    default: return "CUSTOM_AI_API_KEY";
  }
}

function buildPrompt(context: AiFaultContext): string {
  const latest = context.checks[0];
  const lines = [
    `Device: ${context.device.name}`,
    `IP address: ${context.device.ip}`,
    `Device type: ${context.device.type}`,
    `Detected status: ${context.status} (severity: ${context.severity})`,
    "Severity is determined by monitoring rules. Preserve the supplied severity and do not downgrade it.",
    `Probe used: ${context.probe}`,
    latest ? `Latest evidence: ok=${latest.ok}, latency=${latest.latencyMs ?? "n/a"} ms, packet loss=${latest.packetLossPercent}%, bandwidth in=${latest.bandwidthInMbps ?? "n/a"} Mbps, out=${latest.bandwidthOutMbps ?? "n/a"} Mbps, detail=${latest.detail ?? "none"}` : "Latest evidence: none",
    `Recent check history (newest first): ${context.checks.slice(0, 5).map((check) => `${check.checkedAt}: ${check.ok ? "reachable" : "failed"}, latency ${check.latencyMs ?? "n/a"}ms, loss ${check.packetLossPercent}%`).join("; ") || "none"}`,
    `Recommended action: ${context.recommendation ?? "Diagnose the fault using the measured evidence and recommend a specific next step."}`,
    "",
    context.instruction?.trim() || DEFAULT_INSTRUCTION,
    "",
    "Reply with a short subject line on the first line prefixed with 'Subject:' and then the message body.",
  ];
  return lines.join("\n");
}

type GeneratedMessage = { subject: string; body: string; provider: string; model: string; synthesized: boolean };

function splitSubject(text: string, fallback: AiFaultContext): { subject: string; body: string } {
  const normalized = text.trim();
  const match = normalized.match(/^Subject:\s*(.+)\n?/i);
  if (match) return { subject: match[1].trim(), body: normalized.slice(match[0].length).trim() || normalized };
  const firstLine = normalized.split("\n")[0] ?? "";
  if (firstLine.length <= 90) return { subject: firstLine, body: normalized.split("\n").slice(1).join("\n").trim() || normalized };
  return { subject: `[Network ${fallback.severity}] ${fallback.device.name} is ${fallback.status}`, body: normalized };
}

async function callProvider(config: AiConfig, prompt: string): Promise<string> {
  const { url, style } = providerEndpoint(config.provider, config.baseUrl);
  const defaults: Record<string, string> = { gemini: "gemini-2.5-flash", groq: "llama-3.3-70b-versatile", openai: "gpt-4o-mini", anthropic: "claude-3-5-haiku-latest", mistral: "mistral-small-latest" };
  const model = config.model?.trim() || defaults[config.provider.toLowerCase()] || "gpt-4o-mini";
  if (style === "google") {
    const response = await fetch(`${url}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(config.apiKey ?? "")}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Gemini request failed: ${response.status} ${await response.text().then((text) => text.slice(0, 400))}`);
    const data = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    return data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  }
  if (style === "anthropic") {
    const response = await fetch(`${url}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": config.apiKey ?? "", "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 700, messages: [{ role: "user", content: prompt }] }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Anthropic request failed: ${response.status} ${await response.text().then((text) => text.slice(0, 400))}`);
    const data = (await response.json()) as { content?: Array<{ text?: string }> };
    return data.content?.map((part) => part.text ?? "").join("") ?? "";
  }
  const response = await fetch(`${url}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey ?? ""}` },
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], max_tokens: 700 }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`${config.provider} request failed: ${response.status} ${await response.text().then((text) => text.slice(0, 400))}`);
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? "";
}

function fallbackMessage(context: AiFaultContext): { subject: string; body: string } {
  const latest = context.checks[0];
  const evidence = latest
    ? `Latest probe (${latest.checkedAt}): latency ${latest.latencyMs ?? "n/a"} ms, packet loss ${latest.packetLossPercent}%, bandwidth in ${latest.bandwidthInMbps ?? "n/a"} Mbps / out ${latest.bandwidthOutMbps ?? "n/a"} Mbps.${latest.detail ? ` Detail: ${latest.detail}.` : ""}`
    : "No probe evidence recorded yet.";
  const recommendation = context.status === "Offline"
    ? "Verify power and cabling on the device, check the upstream switch port, and confirm gateway reachability before escalating to the ISP."
    : "Inspect interface errors, review bandwidth saturation, and confirm QoS and latency to the device within the maintenance window.";
  return {
    subject: `[Network ${context.severity}] ${context.device.name} is ${context.status}`,
    body: [
      `Network fault detected.`,
      ``,
      `Device: ${context.device.name}`,
      `IP: ${context.device.ip}`,
      `Type: ${context.device.type}`,
      `Status: ${context.status}`,
      `Severity: ${context.severity}`,
      `Probe: ${context.probe}`,
      ``,
      `Evidence: ${evidence}`,
      ``,
      `Recommended action: ${recommendation}`,
    ].join("\n"),
  };
}

export async function synthesizeFaultMessage(context: AiFaultContext, config: AiConfig): Promise<GeneratedMessage> {
  const apiKey = config.apiKey || process.env[providerKeyEnv(config.provider)];
  const prompt = buildPrompt(context);
  if (!apiKey) {
    const fallback = fallbackMessage(context);
    return { subject: fallback.subject, body: fallback.body, provider: config.provider, model: config.model ?? "rule-based", synthesized: false };
  }
  try {
    const text = await callProvider(config, prompt);
    if (!text.trim()) throw new Error("Empty AI response");
    const { subject, body } = splitSubject(text, context);
    return { subject, body, provider: config.provider, model: config.model ?? "", synthesized: true };
  } catch (error) {
    const fallback = fallbackMessage(context);
    return { subject: fallback.subject, body: fallback.body, provider: config.provider, model: `${config.model ?? "rule-based"} (fallback: ${error instanceof Error ? error.message : "unknown"})`, synthesized: false };
  }
}
