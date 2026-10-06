"use client";

import type { SettingsForm } from "./types";

type Props = {
  settings: SettingsForm;
  onSettingsChange: (patch: Partial<SettingsForm>) => void;
  workflowName: string;
  onWorkflowNameChange: (value: string) => void;
  onSaveSettings: () => void;
  onTestAi: () => void;
  onTestEmail: () => void;
  emailTestState: string;
  aiTestState: string;
  aiPreview: { subject: string; body: string; provider: string; model: string; synthesized: boolean } | null;
};

/** Monitoring thresholds and notification workflow settings. */
export function SettingsPanel({ settings, onSettingsChange, workflowName, onWorkflowNameChange, onSaveSettings, onTestAi, onTestEmail, emailTestState, aiTestState, aiPreview }: Props) {
  return (
    <section className="section-panel">
      <div className="section-panel-inner api-panel">
        <span className="overline">NETWORK / SETTINGS</span>
        <h1>Monitoring and notification settings</h1>
        <p>Configure thresholds used by network events and the notification workflow.</p>
        <div className="credential-form">
          <label>Polling interval<select value={settings.pollingInterval} onChange={(e) => onSettingsChange({ pollingInterval: e.target.value })}><option value="60">1 minute</option><option value="300">5 minutes</option><option value="600">10 minutes</option></select></label>
          <label>Failure threshold<select value={settings.failureThreshold} onChange={(e) => onSettingsChange({ failureThreshold: e.target.value })}><option value="2">2 missed responses</option><option value="3">3 missed responses</option><option value="5">5 missed responses</option></select></label>
          <label>High latency warning (ms)<input type="number" min="1" value={settings.latencyWarningMs} onChange={(e) => onSettingsChange({ latencyWarningMs: e.target.value })} /></label>
          <label>Packet loss warning (%)<input type="number" min="1" max="100" value={settings.packetLossWarningPercent} onChange={(e) => onSettingsChange({ packetLossWarningPercent: e.target.value })} /></label>
          <label>AI email provider<select value={settings.aiProvider} onChange={(e) => {
            const provider = e.target.value;
            const defaults: Record<string, string> = { groq: "llama-3.3-70b-versatile", gemini: "gemini-2.5-flash", openai: "gpt-4o-mini", anthropic: "claude-3-5-haiku-latest", mistral: "mistral-small-latest" };
            onSettingsChange({ aiProvider: provider, aiModel: defaults[provider] ?? "" });
          }}><option value="groq">Groq</option><option value="gemini">Gemini</option><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option><option value="mistral">Mistral</option></select></label>
          <label>AI model<input value={settings.aiModel} onChange={(e) => onSettingsChange({ aiModel: e.target.value })} placeholder="llama-3.3-70b-versatile" /></label>
          <label>Groq / AI API key<input type="password" autoComplete="new-password" value={settings.aiApiKey} onChange={(e) => onSettingsChange({ aiApiKey: e.target.value })} placeholder={settings.aiApiKeyConfigured ? "Saved securely; enter a new key to replace" : "Paste API key"} /></label>
          <small className="field-note">{settings.aiApiKeyConfigured ? "An API key is saved encrypted for this organization. It is never returned to the browser." : "No organization API key saved. A server environment key may be used as fallback."}</small>
          <label>Email composition prompt<textarea rows={6} value={settings.aiInstruction} onChange={(e) => onSettingsChange({ aiInstruction: e.target.value })} placeholder="Describe tone, length, evidence to include, and how to recommend next steps." /></label>
          <label>Administrator email<input type="email" value={settings.adminEmail} onChange={(e) => onSettingsChange({ adminEmail: e.target.value })} placeholder="admin@example.com" /></label>
          <label>SMTP host<input value={settings.smtpHost} onChange={(e) => onSettingsChange({ smtpHost: e.target.value })} placeholder="smtp.gmail.com" /></label>
          <label>SMTP port<input type="number" min="1" max="65535" value={settings.smtpPort} onChange={(e) => onSettingsChange({ smtpPort: e.target.value })} /></label>
          <label>SMTP TLS<select value={settings.smtpSecure ? "true" : "false"} onChange={(e) => onSettingsChange({ smtpSecure: e.target.value === "true" })}><option value="true">Implicit TLS (465)</option><option value="false">STARTTLS (587)</option></select></label>
          <label>SMTP username<input type="email" value={settings.smtpUser} onChange={(e) => onSettingsChange({ smtpUser: e.target.value })} placeholder="monitoring@gmail.com" /></label>
          <label>From address<input type="email" value={settings.smtpFrom} onChange={(e) => onSettingsChange({ smtpFrom: e.target.value })} placeholder={settings.smtpUser || "monitoring@gmail.com"} /></label>
          <label>SMTP password / app password<input type="password" autoComplete="new-password" value={settings.smtpPassword} onChange={(e) => onSettingsChange({ smtpPassword: e.target.value })} placeholder={settings.smtpPasswordConfigured ? "Saved securely; enter a new password to replace" : "Paste SMTP password or app password"} /></label>
          <small className="field-note">{settings.smtpPasswordConfigured ? "SMTP credentials are saved encrypted for this organization." : "No organization SMTP password saved. Server environment settings may be used as fallback."}</small>
          <label>Default notification workflow<input value={workflowName} onChange={(e) => onWorkflowNameChange(e.target.value)} /></label>
          <button className="btn primary" type="button" onClick={onSaveSettings}>Save monitoring settings</button>
          <button className="btn ghost" type="button" onClick={onTestAi}>Preview AI email</button>
          {aiTestState && <small className="field-note">{aiTestState}</small>}
          {aiPreview && <div className="database-choice"><strong>{aiPreview.subject}</strong><span>{aiPreview.synthesized ? `Generated by ${aiPreview.provider} (${aiPreview.model})` : `Rule-based fallback (${aiPreview.model})`}</span><pre>{aiPreview.body}</pre></div>}
          <button className="btn ghost" type="button" onClick={onTestEmail}>Send test email</button>
          {emailTestState && <small className="field-note">{emailTestState}</small>}
          <div className="database-choice"><strong>Alert severity rules</strong><span>Offline is Critical after the configured consecutive failure threshold. Warning is raised for latency or packet loss above these limits. AI may explain severity but cannot change it.</span></div>
          <div className="database-choice"><strong>Email delivery</strong><span>Save SMTP settings, then send a test email to verify Nodemailer delivery before relying on automated fault alerts.</span></div>
        </div>
      </div>
    </section>
  );
}
