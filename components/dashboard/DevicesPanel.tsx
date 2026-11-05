"use client";

import { useState, type FormEvent } from "react";
import { Check, Network, Pencil, Plus, Trash2, X } from "lucide-react";
import { DeviceGlyph } from "./node-canvas";
import type { BackendResult, DeviceEntry, DeviceForm, DeviceTestState } from "./types";

type Props = {
  devices: DeviceEntry[];
  results: BackendResult[];
  formOpen: boolean;
  form: DeviceForm;
  onOpenForm: () => void;
  onCloseForm: () => void;
  onFormChange: (patch: Partial<DeviceForm>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRemove: (ip: string) => void;
  onRename: (device: DeviceEntry, name: string) => Promise<void>;
  onTest: (device: DeviceEntry) => void;
  testState: DeviceTestState | null;
};

/** Registered network devices: add, probe and remove monitoring targets. */
export function DevicesPanel({ devices, results, formOpen, form, onOpenForm, onCloseForm, onFormChange, onSubmit, onRemove, onRename, onTest, testState }: Props) {
  const [editingId, setEditingId] = useState("");
  const [editedName, setEditedName] = useState("");
  return (
    <section className="section-panel">
      <div className="section-panel-inner wide-panel">
        <div className="section-heading-row">
          <div><span className="overline">NETWORK / DEVICES</span><h1>Registered devices</h1><p>Administrators add network nodes here. IP address is required; subnet mask and MAC address are optional.</p></div>
          <button className="btn primary" onClick={onOpenForm}><Plus size={16} /> Add device</button>
        </div>

        <div className="device-registry">
          {devices.map((d) => <article className="device-row" key={d.ip}>
            <div className="device-node-icon"><DeviceGlyph type={d.type} size={24} /></div>
            <div className="device-main">
              {editingId === (d.id || d.ip) ? (
                <form
                  className="device-name-edit"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    await onRename(d, editedName);
                    setEditingId("");
                  }}
                >
                  <input value={editedName} onChange={(event) => setEditedName(event.target.value)} aria-label={`Rename ${d.name}`} autoFocus required />
                  <button className="icon-btn" type="submit" title="Save device name"><Check size={15} /></button>
                  <button className="icon-btn" type="button" title="Cancel rename" onClick={() => setEditingId("")}><X size={15} /></button>
                </form>
              ) : (
                <>
                  <strong>{d.name}</strong>
                  <small>{d.ip}</small>
                </>
              )}
            </div>
            <div className="device-meta"><span>Subnet</span><strong>{d.subnet || "Not set"}</strong></div>
            <div className="device-meta"><span>MAC</span><strong>{d.mac || "Not set"}</strong></div>
            <div className={`device-status ${d.status.toLowerCase()}`}><span />{d.status}</div>
            <button className="btn ghost" title="Run ping test against this device" onClick={() => onTest(d)}>Test</button>
            <button
              className="icon-btn"
              title="Rename device"
              onClick={() => {
                setEditingId(d.id || d.ip);
                setEditedName(d.name);
              }}
            ><Pencil size={16} /></button>
            <button className="icon-btn danger" title="Remove device" onClick={() => onRemove(d.ip)}><Trash2 size={16} /></button>
          </article>)}
        </div>

        {testState && (
          <div className={`device-test-terminal ${testState.status}`}>
            <div className="device-test-terminal-head">
              <div><span className="terminal-dot red" /><span className="terminal-dot amber" /><span className="terminal-dot green" /></div>
              <strong>NetMoni Probe Terminal</strong>
              <span>{testState.deviceName} · {testState.ip}</span>
            </div>
            <div className="device-test-progress">
              <div className="device-test-progress-head">
                <strong>{testState.status === "running" ? "Probe in progress" : "Probe complete"}</strong>
                <span>{testState.progress}%</span>
              </div>
              <div className="device-test-progress-track"><div style={{ width: `${testState.progress}%` }} /></div>
            </div>
            <pre className="device-test-output">
              {testState.command && <span className="terminal-command">$ {testState.command}</span>}
              {testState.lines.map((line, index) => <span key={`${index}-${line}`} className={line.startsWith("error:") ? "terminal-error" : line.startsWith("ok:") ? "terminal-success" : ""}>{line}</span>)}
              {testState.status === "running" && <span className="terminal-cursor">▌</span>}
            </pre>
          </div>
        )}

        {results.length > 0 && (
          <div className="dashboard-integration-grid">
            <article className="dashboard-integration-card">
              <div className="dashboard-integration-icon">⇅</div>
              <div><strong>Latest probe: {results[0].deviceName}</strong>
                <small>{results[0].probe.toUpperCase()} · {results[0].checkedAt.slice(0, 19).replace("T", " ")}</small>
                <p>{results[0].ok ? "Reachable" : "Unreachable"} · {results[0].latencyMs ?? "–"} ms · {results[0].packetLossPercent}% loss{results[0].bandwidthInMbps !== null ? ` · in ${results[0].bandwidthInMbps.toFixed(2)} Mbps` : ""}{results[0].bandwidthOutMbps !== null ? ` · out ${results[0].bandwidthOutMbps.toFixed(2)} Mbps` : ""}</p>
              </div>
            </article>
            <article className="dashboard-integration-card">
              <div className="dashboard-integration-icon">✓</div>
              <div><strong>Checks stored</strong><small>Monitoring database</small><p>{results.length} recent probe results retained.</p></div>
            </article>
          </div>
        )}

        {formOpen && <div className="modal-backdrop" onMouseDown={onCloseForm}>
          <div className="device-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head"><div><span className="overline">NETWORK / DEVICE</span><h2>Add monitoring node</h2></div><button className="icon-btn" onClick={onCloseForm}><X size={18} /></button></div>
            <form className="credential-form" onSubmit={onSubmit}>
              <label>Device name<input value={form.name} onChange={(e) => onFormChange({ name: e.target.value })} placeholder="Core Router" required /></label>
              <div className="form-grid-2">
                <label>IP address<input value={form.ip} onChange={(e) => onFormChange({ ip: e.target.value })} placeholder="192.168.1.1" required /></label>
                <label>Device type<select value={form.type} onChange={(e) => onFormChange({ type: e.target.value })}><option value="router">Router / AP</option><option value="switch">Switch</option><option value="server">Server</option></select></label>
              </div>
              <div className="form-grid-2">
                <label>Subnet mask <span className="optional">(optional)</span><input value={form.subnet} onChange={(e) => onFormChange({ subnet: e.target.value })} placeholder="255.255.255.0" /></label>
                <label>MAC address <span className="optional">(optional)</span><input value={form.mac} onChange={(e) => onFormChange({ mac: e.target.value })} placeholder="00:1B:44:11:3A:B7" /></label>
              </div>
              <div className="database-choice"><strong><Network size={16} /> Workflow node</strong><span>This device becomes available to monitoring and network fault automation.</span></div>
              <button className="btn primary full" type="submit"><Plus size={16} /> Add device to network</button>
            </form>
          </div>
        </div>}
      </div>
    </section>
  );
}
