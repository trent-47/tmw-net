"use client";

import type { FormEvent } from "react";
import { CheckCircle2, Sparkles, X } from "lucide-react";
import { NodeGlyph, typeLabel } from "./node-canvas";
import type { WorkflowNode } from "./types";

export type AiController = {
  provider: string;
  models: Record<string, string>;
  keys: Record<string, string>;
  keyConfigured: boolean;
  baseUrls: Record<string, string>;
  keyState: string;
  instruction: string;
  onProviderChange: (nodeId: string, provider: string) => void;
  onKeyChange: (nodeId: string, value: string) => void;
  onModelChange: (nodeId: string, model: string) => void;
  onBaseUrlChange: (value: string) => void;
  onInstructionChange: (nodeId: string, value: string) => void;
  onSaveKey: () => void;
};

export type SmtpController = {
  host: string;
  port: string;
  secure: boolean;
  user: string;
  appPassword: string;
  passwordConfigured: boolean;
  from: string;
  recipients: string;
  state: string;
  adminEmail: string;
  onUserChange: (value: string) => void;
  onAppPasswordChange: (value: string) => void;
  onFromChange: (value: string) => void;
  onRecipientsChange: (value: string) => void;
  onSubmit: (event?: FormEvent<HTMLFormElement>) => void;
};

type Props = {
  node: WorkflowNode;
  tab: "Parameters" | "Settings";
  onTabChange: (tab: "Parameters" | "Settings") => void;
  onRename: (nodeId: string, name: string) => void;
  onConfigChange: (nodeId: string, patch: Record<string, string>) => void;
  onClose: () => void;
  onSaveNode: (nodeName: string) => void;
  ai: AiController;
  smtp: SmtpController;
};

/** Right-hand node configuration panel for the selected workflow node. */
export function NodeInspector({ node, tab, onTabChange, onRename, onConfigChange, onClose, onSaveNode, ai, smtp }: Props) {
  return (
    <aside className="inspector">
      <div className="inspector-head">
        <div className={`inspector-icon type-${node.type}`}><NodeGlyph icon={node.icon} size={20} /></div>
        <div className="inspector-title">
          <input
            value={node.name}
            onChange={(e) => onRename(node.id, e.target.value)}
          />
          <small>{typeLabel(node.type)} node</small>
        </div>
        <button className="icon-btn" onClick={onClose} title="Close node configuration"><X size={17} /></button>
      </div>

      <div className="inspector-tabs">
        {(["Parameters", "Settings"] as const).map((entryTab) => (
          <button key={entryTab} className={tab === entryTab ? "active" : ""} onClick={() => onTabChange(entryTab)}>{entryTab}</button>
        ))}
      </div>

      <div className="inspector-body">
        {tab === "Parameters" ? (
          <>
            {node.type === "trigger" && (
              <div className="field">
                <label>Trigger event</label>
                <select
                  value={node.config?.event ?? "fault"}
                  onChange={(e) => onConfigChange(node.id, { event: e.target.value })}
                >
                  <option value="fault">Device failure detected</option>
                  <option value="status">Device status changed</option>
                  <option value="packet-loss">Packet loss threshold exceeded</option>
                  <option value="response-time">Response time threshold exceeded</option>
                </select>
                <label>Minimum severity</label>
                <select
                  value={node.config?.severity ?? "critical"}
                  onChange={(e) => onConfigChange(node.id, { severity: e.target.value })}
                >
                  <option value="critical">Critical</option>
                  <option value="warning">Warning</option>
                  <option value="any">Any</option>
                </select>
              </div>
            )}

            {node.type === "logic" && (
              <div className="field">
                <label>Fault condition</label>
                <textarea
                  rows={4}
                  value={node.config?.condition ?? ""}
                  onChange={(e) => onConfigChange(node.id, { condition: e.target.value })}
                />
                <small className="field-note">Available fields: status, severity, deviceName, ipAddress, packetLoss, responseTime.</small>
              </div>
            )}

            {node.name === "AI Message" && (
              <div className="ai-config-panel">
                <div className="ai-node-banner">
                  <span className="ai-node-badge"><Sparkles size={16} /></span>
                  <div>
                    <strong>AI provider</strong>
                    <small>Connect Gemini, Groq, OpenAI, Anthropic, Mistral or a custom endpoint.</small>
                  </div>
                </div>

                <div className="field">
                  <label>Provider</label>
                  <select
                    value={ai.provider}
                    onChange={(e) => ai.onProviderChange(node.id, e.target.value)}
                  >
                    <option>Gemini</option>
                    <option>Groq</option>
                    <option>OpenAI</option>
                    <option>Anthropic</option>
                    <option>Mistral</option>
                    <option>Custom</option>
                  </select>
                </div>

                <div className="ai-credential-card">
                  <div className="ai-credential-head">
                    <div className="ai-provider-mark"><Sparkles size={18} /></div>
                    <div>
                      <strong>{ai.provider} API connection</strong>
                      <small>{ai.keyConfigured ? "Organization API key is saved securely on the server." : "No organization API key is saved yet."}</small>
                    </div>
                  </div>

                  <label className="ai-secret-label">
                    API key
                    <div className="ai-secret-input">
                      <input
                        type="password"
                        value={ai.keys[ai.provider] ?? ""}
                        onChange={(e) => ai.onKeyChange(node.id, e.target.value)}
                        placeholder={`Paste ${ai.provider} API key`}
                        autoComplete="off"
                      />
                      <CheckCircle2 size={16} className={ai.keys[ai.provider] || ai.keyConfigured ? "credential-ok" : ""} />
                    </div>
                  </label>

                  <label>
                    Model
                    <input
                      value={ai.models[ai.provider] ?? ""}
                      onChange={(e) => ai.onModelChange(node.id, e.target.value)}
                      placeholder="Model name"
                    />
                  </label>

                  {ai.provider === "Custom" && (
                    <label>
                      Base URL
                      <input
                        value={ai.baseUrls.Custom ?? ""}
                        onChange={(e) => ai.onBaseUrlChange(e.target.value)}
                        placeholder="https://your-ai-endpoint/v1"
                      />
                    </label>
                  )}

                  <button
                    type="button"
                    className="btn primary full"
                    onClick={ai.onSaveKey}
                  >
                    {ai.keyState.startsWith("Saving") ? "Saving..." : ai.keyConfigured && !ai.keys[ai.provider] ? "AI settings saved" : "Save AI settings"}
                  </button>
                  {ai.keyState && <small className="field-note">{ai.keyState}</small>}
                </div>

                <div className="field">
                  <label>Message instruction</label>
                  <textarea
                    rows={6}
                    value={ai.instruction}
                    onChange={(e) => ai.onInstructionChange(node.id, e.target.value)}
                  />
                </div>

                <div className="ai-fields">
                  <span><strong>deviceName</strong><small>affected node</small></span>
                  <span><strong>ipAddress</strong><small>network address</small></span>
                  <span><strong>severity</strong><small>fault level</small></span>
                  <span><strong>recommendation</strong><small>AI-generated action</small></span>
                </div>

                <div className="expr-hint ai-hint">
                  <Sparkles size={15} />
                  <div>The AI node receives the fault event and produces the message consumed by the Gmail node.</div>
                </div>
              </div>
            )}

            {node.name === "Send Gmail" && (
              <form className="credential-form" onSubmit={smtp.onSubmit}>
                <div className="field-note">Nodemailer / Google SMTP</div>
                <label>SMTP host<input value={smtp.host} readOnly /></label>
                <div className="form-grid-2">
                  <label>Port<input value={smtp.port} readOnly /></label>
                  <label>TLS<input value={smtp.secure ? "Implicit TLS" : "STARTTLS"} readOnly /></label>
                </div>
                <label>Google / Gmail account<input type="email" value={smtp.user} onChange={(e) => smtp.onUserChange(e.target.value)} placeholder="monitoring@gmail.com" required /></label>
                <label>Google App Password<input type="password" value={smtp.appPassword} onChange={(e) => smtp.onAppPasswordChange(e.target.value)} placeholder={smtp.passwordConfigured ? "Saved securely; enter to replace" : "16-character app password"} required={!smtp.passwordConfigured} /></label>
                <label>From<input value={smtp.from} onChange={(e) => smtp.onFromChange(e.target.value)} /></label>
                <div className="admin-recipient"><CheckCircle2 size={15} /><span>Automatic recipient: <strong>{smtp.adminEmail}</strong></span></div>
                <label>Admin Gmail recipient<input value={smtp.recipients || smtp.adminEmail} onChange={(e) => smtp.onRecipientsChange(e.target.value)} placeholder={smtp.adminEmail} /></label>
                <label>Subject<input defaultValue="[Network Alert] {{$json.deviceName}} is {{$json.status}}" /></label>
                <label>Message<textarea rows={7} defaultValue={"Network fault detected.\n\nDevice: {{$json.deviceName}}\nIP: {{$json.ipAddress}}\nStatus: {{$json.status}}\nSeverity: {{$json.severity}}\nResponse: {{$json.responseTime}} ms\nPacket loss: {{$json.packetLoss}}%\n\nPlease investigate the affected node."} /></label>
                <button type="submit" className="btn primary full">{smtp.state ? "SMTP configured" : "Save SMTP settings"}</button>
                {smtp.state && <small className="field-note">{smtp.state}</small>}
              </form>
            )}

            {node.type === "action" && node.name !== "Send Fault Email" && (
              <div className="field">
                <label>Action parameters</label>
                <input placeholder="Network event or API configuration" />
                <textarea rows={4} placeholder="Map values from the fault event..." />
              </div>
            )}

            <div className="expr-hint">
              <span>fx</span>
              <div>Use expressions such as <code>{"{{$json.deviceName}}"}</code> and <code>{"{{$json.ipAddress}}"}</code> in notification fields.</div>
            </div>
          </>
        ) : (
          <div className="field">
            <label>Execution settings</label>
            <label className="toggle-row"><span><strong>Execute once</strong><small>Run this node once for each network event.</small></span><input type="checkbox" defaultChecked /><span className="switch" /></label>
            <label className="toggle-row"><span><strong>Retry on failure</strong><small>Retry SMTP dispatch if delivery fails.</small></span><input type="checkbox" defaultChecked /><span className="switch" /></label>
            <label className="toggle-row"><span><strong>Record execution</strong><small>Keep the event for network reports.</small></span><input type="checkbox" defaultChecked /><span className="switch" /></label>
          </div>
        )}
      </div>
      <div className="inspector-footer">
        <button type="button" className="btn ghost" onClick={onClose}>Cancel / close</button>
        <button type="button" className="btn primary" onClick={() => onSaveNode(node.name)}>Save node</button>
      </div>
    </aside>
  );
}
