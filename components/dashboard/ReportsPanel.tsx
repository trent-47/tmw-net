"use client";

import { Download, FileText } from "lucide-react";
import type { BackendAlert, BackendResult, ExecutionRun } from "./types";

type Props = {
  results: BackendResult[];
  alerts: BackendAlert[];
  history: ExecutionRun[];
};

export function ReportsPanel({ results, alerts, history }: Props) {
  const reachable = results.filter((result) => result.ok).length;
  const faults = results.filter((result) => !result.ok).length;

  const exportCsv = () => {
    const rows = [
      ["Device", "IP", "Probe", "Status", "Latency ms", "Packet loss %", "Checked at"],
      ...results.map((result) => [
        result.deviceName,
        result.ipAddress,
        result.probe,
        result.ok ? "Reachable" : "Unreachable",
        result.latencyMs ?? "",
        result.packetLossPercent,
        result.checkedAt,
      ]),
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `netmoni-report-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="section-panel">
      <div className="section-panel-inner wide-panel">
        <div className="section-heading-row">
          <div><span className="overline">NETWORK / REPORTS</span><h1>Monitoring reports</h1><p>Network health, notification and workflow execution summaries.</p></div>
          <button className="btn ghost" type="button" onClick={exportCsv} disabled={!results.length}><Download size={15} /> Export CSV</button>
        </div>
        <div className="dashboard-integration-grid">
          <article className="dashboard-integration-card"><div className="dashboard-integration-icon"><FileText size={18} /></div><div><strong>{results.length} probe reports</strong><small>Recent monitoring checks</small><p>{reachable} reachable · {faults} unreachable</p></div></article>
          <article className="dashboard-integration-card"><div className="dashboard-integration-icon">!</div><div><strong>{alerts.length} notifications</strong><small>Fault and recovery alerts</small><p>{alerts.filter((alert) => alert.emailStatus === "sent").length} email deliveries recorded</p></div></article>
          <article className="dashboard-integration-card"><div className="dashboard-integration-icon">✓</div><div><strong>{history.length} workflow executions</strong><small>Current browser session</small><p>{history.filter((run) => run.status === "Success").length} successful · {history.filter((run) => run.status === "Failed").length} failed</p></div></article>
        </div>

        <div className="dashboard-integration-grid" style={{ marginTop: 16 }}>
          {results.slice(0, 12).map((result) => (
            <article className="dashboard-integration-card" key={result.id}>
              <div className={`device-status ${result.ok ? "online" : "offline"}`}><span /></div>
              <div><strong>{result.deviceName} · {result.probe.toUpperCase()}</strong><small>{result.ipAddress} · {result.checkedAt.slice(0, 19).replace("T", " ")}</small><p>{result.ok ? "Reachable" : "Unreachable"} · {result.latencyMs ?? "–"} ms · {result.packetLossPercent}% loss</p></div>
            </article>
          ))}
          {!results.length && <article className="dashboard-integration-card"><div><strong>No report data yet</strong><p>Run a device test or start a published workflow.</p></div></article>}
        </div>
      </div>
    </section>
  );
}
