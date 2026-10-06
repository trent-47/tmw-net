"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  AlertsPanel,
  DashboardFrame,
  DashboardStyles,
  DevicesPanel,
  EntryScreen,
  ExecutionsPanel,
  NodeInspector,
  OverviewPanel,
  SettingsPanel,
  WorkflowEditor,
  WorkflowLibrary,
  DEFAULT_VIEWPORT,
  NODE_H,
  NODE_W,
  nodeDimensions,
  nodeLibrary,
} from "@/components/dashboard";
import {
  getThemeServerSnapshot,
  getThemeSnapshot,
  setThemePreference,
  subscribeTheme,
} from "@/components/dashboard/workspace-store";
import type {
  BackendAlert,
  BackendResult,
  DeviceEntry,
  DeviceForm,
  EditorSection,
  EntryField,
  EntryStage,
  ExecutionRun,
  NodeLibraryItem,
  SavedWorkflow,
  SettingsForm,
  Viewport,
  WorkflowNode,
} from "@/components/dashboard";

const initialNodes: WorkflowNode[] = [];

const initialDevices: DeviceEntry[] = [];
const AI_PROVIDER_LABELS: Record<string, string> = { gemini: "Gemini", groq: "Groq", openai: "OpenAI", anthropic: "Anthropic", mistral: "Mistral", custom: "Custom" };

function aiProviderLabel(provider: string): string {
  return AI_PROVIDER_LABELS[provider.toLowerCase()] ?? provider;
}

export default function NetworkAutomationEditor() {
  /* ---------------- entry flow state ---------------- */
  const [entryStage, setEntryStage] = useState<EntryStage>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [confirmOwnerPassword, setConfirmOwnerPassword] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [currentUser, setCurrentUser] = useState({ name: "", email: "" });
  const [entryError, setEntryError] = useState("");
  const [entryBusy, setEntryBusy] = useState(false);

  /* ---------------- network automation workspace ---------------- */
  const [nodes, setNodes] = useState<WorkflowNode[]>(initialNodes);
  const [selectedNode, setSelectedNode] = useState("");
  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT);
  const [running, setRunning] = useState(false);
  const [published, setPublished] = useState(false);
  const [search, setSearch] = useState("");
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [settingsState, setSettingsState] = useState<SettingsForm>({
    pollingInterval: "60",
    failureThreshold: "3",
    latencyWarningMs: "500",
    packetLossWarningPercent: "10",
    aiProvider: "groq",
    aiModel: "llama-3.3-70b-versatile",
    aiInstruction: "Write a concise, professional network fault email. State the measured severity without changing it, include device name, IP, probe result, latency, packet loss and recent check history, then recommend evidence-based troubleshooting steps.",
    aiApiKey: "",
    aiApiKeyConfigured: false,
    aiProviderConfigurations: [],
    adminEmail: "",
    smtpHost: "smtp.gmail.com",
    smtpPort: "465",
    smtpSecure: true,
    smtpUser: "",
    smtpFrom: "",
    smtpPassword: "",
    smtpPasswordConfigured: false,
  });
  const [executionHistory, setExecutionHistory] = useState<ExecutionRun[]>([]);
  const [backendAlerts, setBackendAlerts] = useState<BackendAlert[]>([]);
  const [backendResults, setBackendResults] = useState<BackendResult[]>([]);
  const [uiNotice, setUiNotice] = useState("");
  const [activeSection, setActiveSection] = useState<EditorSection>("Workflows");
  const theme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, getThemeServerSnapshot);
  const [workflowName, setWorkflowName] = useState("");
  const [workflowLibrary, setWorkflowLibrary] = useState<SavedWorkflow[]>([]);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(null);
  const [workflowView, setWorkflowView] = useState<"library" | "editor">("library");
  const [workflowSearch, setWorkflowSearch] = useState("");
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [nameInvalid, setNameInvalid] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<"Parameters" | "Settings">("Parameters");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpAppPassword, setSmtpAppPassword] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");
  const [smtpRecipients, setSmtpRecipients] = useState("");
  const [smtpState, setSmtpState] = useState("");
  const [devices, setDevices] = useState<DeviceEntry[]>(initialDevices);
  const [deviceFormOpen, setDeviceFormOpen] = useState(false);
  const [deviceForm, setDeviceForm] = useState<DeviceForm>({
    name: "",
    ip: "",
    subnet: "",
    mac: "",
    type: "router",
  });
  const [aiProvider, setAiProvider] = useState("Gemini");
  const [aiInstruction, setAiInstruction] = useState(
    "Write a concise, professional network fault notification. Include the affected device, IP, severity, evidence and recommended action."
  );
  const [aiTestState, setAiTestState] = useState("");
  const [emailTestState, setEmailTestState] = useState("");
  const [aiPreview, setAiPreview] = useState<{ subject: string; body: string; provider: string; model: string; synthesized: boolean } | null>(null);
  const [aiKeys, setAiKeys] = useState<Record<string, string>>({
    Gemini: "",
    Groq: "",
    OpenAI: "",
    Anthropic: "",
    Mistral: "",
    Custom: "",
  });
  const [aiModels, setAiModels] = useState<Record<string, string>>({
    Gemini: "gemini-2.5-flash",
    Groq: "llama-3.3-70b-versatile",
    OpenAI: "gpt-5-mini",
    Anthropic: "claude-sonnet-4-5",
    Mistral: "mistral-large-latest",
    Custom: "",
  });
  const [aiBaseUrls, setAiBaseUrls] = useState<Record<string, string>>({ Custom: "" });
  const [aiKeyState, setAiKeyState] = useState("");
  const adminEmail = currentUser.email || smtpRecipients || "";

  const canvasRef = useRef<HTMLDivElement>(null);
  const monitoringSettingsDirty = useRef(false);
  const dragRef = useRef<
    | { kind: "pan"; startClientX: number; startClientY: number; startVx: number; startVy: number }
    | { kind: "node"; id: string; offX: number; offY: number }
    | null
  >(null);

  const selected = nodes.find((n) => n.id === selectedNode);
  const filteredLibrary = nodeLibrary.filter((n) =>
    `${n.name} ${n.description}`.toLowerCase().includes(search.toLowerCase()),
  );

  /* Save state is derived: "saving" while the editor differs from the last saved snapshot. */
  const currentSnapshot = JSON.stringify({ nodes, workflowName, published });
  const saveState: "saved" | "saving" =
    workflowView === "editor" && activeWorkflowId && savedSnapshot !== currentSnapshot ? "saving" : "saved";

  const toggleTheme = () => setThemePreference(theme === "dark" ? "light" : "dark");

  useEffect(() => {
    if (entryStage !== "editor") return;
    let cancelled = false;
    const loadWorkspace = async () => {
      try {
        const [deviceResponse, settingsResponse, alertsResponse, resultsResponse, workflowResponse] = await Promise.all([
          fetch("/api/monitoring/devices"),
          fetch("/api/monitoring/settings"),
          fetch("/api/monitoring/alerts"),
          fetch("/api/monitoring/results?limit=50"),
          fetch("/api/automations"),
        ]);
        if (cancelled) return;
        if (deviceResponse.ok) {
          const data = await deviceResponse.json() as { devices?: Array<Record<string, unknown>> };
          if (data.devices && Array.isArray(data.devices)) {
            setDevices(data.devices.map((device) => ({
              name: String(device.name ?? ""),
              ip: String(device.ip ?? ""),
              subnet: String(device.subnet ?? ""),
              mac: String(device.mac ?? ""),
              type: String(device.type ?? "router"),
              status: String(device.status ?? "Online"),
            })));
          }
        }
        if (settingsResponse.ok) {
          const data = await settingsResponse.json() as { settings?: Record<string, unknown> };
          if (data.settings && !monitoringSettingsDirty.current) {
            setSettingsState((current) => ({
              ...current,
              pollingInterval: String(data.settings?.intervalSeconds ?? current.pollingInterval),
              failureThreshold: String(data.settings?.failureThreshold ?? current.failureThreshold),
              latencyWarningMs: String(data.settings?.latencyWarningMs ?? current.latencyWarningMs),
              packetLossWarningPercent: String(data.settings?.packetLossWarningPercent ?? current.packetLossWarningPercent),
              aiProvider: String(data.settings?.aiProvider ?? current.aiProvider),
              aiModel: String(data.settings?.aiModel ?? current.aiModel),
              aiInstruction: String(data.settings?.aiInstruction ?? current.aiInstruction),
              aiApiKeyConfigured: Boolean(data.settings?.aiApiKeyConfigured),
              aiProviderConfigurations: Array.isArray(data.settings?.aiProviderConfigurations)
                ? data.settings.aiProviderConfigurations as SettingsForm["aiProviderConfigurations"]
                : current.aiProviderConfigurations,
              aiApiKey: current.aiApiKey,
              adminEmail: String(data.settings?.adminEmail ?? current.adminEmail),
              smtpHost: String(data.settings?.smtpHost ?? current.smtpHost),
              smtpPort: String(data.settings?.smtpPort ?? current.smtpPort),
              smtpSecure: Boolean(data.settings?.smtpSecure ?? current.smtpSecure),
              smtpUser: String(data.settings?.smtpUser ?? current.smtpUser),
              smtpFrom: String(data.settings?.smtpFrom ?? current.smtpFrom),
              smtpPassword: current.smtpPassword,
              smtpPasswordConfigured: Boolean(data.settings?.smtpPasswordConfigured),
            }));
            setSmtpRecipients(String(data.settings.adminEmail ?? ""));
            setSmtpUser(String(data.settings.smtpUser ?? ""));
            setSmtpFrom(String(data.settings.smtpFrom ?? ""));
            if (data.settings?.aiProvider) {
              const providerLabel = aiProviderLabel(String(data.settings.aiProvider));
              setAiProvider(providerLabel);
              const providerConfigurations = Array.isArray(data.settings.aiProviderConfigurations)
                ? data.settings.aiProviderConfigurations as SettingsForm["aiProviderConfigurations"]
                : [];
              setAiModels((current) => ({
                ...current,
                ...Object.fromEntries(providerConfigurations.map((configuration) => [aiProviderLabel(configuration.provider), configuration.model])),
                [providerLabel]: String(data.settings?.aiModel ?? current[providerLabel] ?? ""),
              }));
            }
            if (data.settings?.aiInstruction) setAiInstruction(String(data.settings.aiInstruction));
          }
        }
        if (alertsResponse.ok) {
          const data = await alertsResponse.json() as { alerts?: Array<Record<string, unknown>> };
          setBackendAlerts((data.alerts ?? []).map((alert) => ({
            id: String(alert.id ?? ""),
            deviceName: String(alert.deviceName ?? ""),
            ipAddress: String(alert.ipAddress ?? ""),
            severity: String(alert.severity ?? "info"),
            status: String(alert.status ?? ""),
            summary: String(alert.summary ?? ""),
            emailStatus: String(alert.emailStatus ?? "pending"),
            createdAt: String(alert.createdAt ?? ""),
          })));
        }
        if (resultsResponse.ok) {
          const data = await resultsResponse.json() as { results?: Array<Record<string, unknown>> };
          setBackendResults((data.results ?? []).map((result) => ({
            id: String(result.id ?? ""),
            deviceName: String(result.deviceName ?? ""),
            ipAddress: String(result.ipAddress ?? ""),
            probe: String(result.probe ?? "ping"),
            ok: Boolean(result.ok),
            latencyMs: result.latencyMs === null || result.latencyMs === undefined ? null : Number(result.latencyMs),
            packetLossPercent: Number(result.packetLossPercent ?? 0),
            bandwidthInMbps: result.bandwidthInMbps === null || result.bandwidthInMbps === undefined ? null : Number(result.bandwidthInMbps),
            bandwidthOutMbps: result.bandwidthOutMbps === null || result.bandwidthOutMbps === undefined ? null : Number(result.bandwidthOutMbps),
            checkedAt: String(result.checkedAt ?? ""),
          })));
        }
        if (workflowResponse.ok) {
          const data = await workflowResponse.json() as { workflows?: Array<Record<string, unknown>> };
          const savedWorkflows: SavedWorkflow[] = (data.workflows ?? []).map((workflow, index) => {
            const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : [];
            return {
              id: String(workflow.id ?? `workflow-${index}`),
              name: String(workflow.name ?? "Untitled workflow"),
              published: Boolean(workflow.enabled),
              createdAt: String(workflow.createdAt ?? new Date().toISOString()),
              updatedAt: String(workflow.updatedAt ?? new Date().toISOString()),
              nodes: nodes.map((node, nodeIndex) => ({
                id: String(node.id ?? `${workflow.id ?? "workflow"}-${nodeIndex}`),
                type: (node.kind === "trigger" || node.kind === "logic" || node.kind === "action") ? node.kind as WorkflowNode["type"] : "action",
                name: String(node.name ?? "Node"),
                description: String(node.description ?? `${String(node.kind ?? "action")} node`),
                icon: String(node.icon ?? (node.name?.toLowerCase().includes("gmail") ? "mail" : node.name?.toLowerCase().includes("ai") ? "ai" : node.name?.toLowerCase().includes("alert") ? "alert" : node.kind === "trigger" ? "network" : node.kind === "logic" ? "if" : "zap")),
                x: 240 + (nodeIndex % 4) * 260,
                y: 180 + Math.floor(nodeIndex / 4) * 180,
                config: node.config && typeof node.config === "object" ? Object.fromEntries(Object.entries(node.config).map(([key, value]) => [key, String(value)])) : undefined,
              })),
            };
          });
          setWorkflowLibrary(savedWorkflows);
        }
      } catch {
        /* workspace loads with local defaults when the API is unreachable */
      }
    };
    void loadWorkspace();

    const poll = window.setInterval(loadWorkspace, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [entryStage]);

  useEffect(() => {
    document.documentElement.dataset.networkTheme = theme;
  }, [theme]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setViewport((v) => {
        const zoom = Math.min(1.8, Math.max(0.3, v.zoom * (e.deltaY < 0 ? 1.1 : 0.9)));
        const scale = zoom / v.zoom;
        return { zoom, x: mx - (mx - v.x) * scale, y: my - (my - v.y) * scale };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const toCanvas = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: (clientX - rect.left - viewport.x) / viewport.zoom, y: (clientY - rect.top - viewport.y) / viewport.zoom };
  };

  const onCanvasPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { kind: "pan", startClientX: e.clientX, startClientY: e.clientY, startVx: viewport.x, startVy: viewport.y };
  };

  const openNodeInspector = (id: string) => {
    setSelectedNode(id);
    setLeftOpen(true);
    setRightOpen(true);
    setActiveSection("Workflows");
  };

  const closeNodeInspector = () => {
    setRightOpen(false);
    // Closing a node configuration always restores the node library.
    setLeftOpen(true);
  };

  const showNotice = (message: string) => {
    setUiNotice(message);
    window.setTimeout(() => setUiNotice(""), 2200);
  };

  const onNodePointerDown = (e: ReactPointerEvent, node: WorkflowNode) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    canvasRef.current?.setPointerCapture(e.pointerId);
    const p = toCanvas(e.clientX, e.clientY);
    dragRef.current = { kind: "node", id: node.id, offX: p.x - node.x, offY: p.y - node.y };
    openNodeInspector(node.id);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === "pan") {
      setViewport((v) => ({ ...v, x: drag.startVx + e.clientX - drag.startClientX, y: drag.startVy + e.clientY - drag.startClientY }));
    } else {
      const p = toCanvas(e.clientX, e.clientY);
      setNodes((cur) => cur.map((n) => n.id === drag.id ? { ...n, x: p.x - drag.offX, y: p.y - drag.offY } : n));
    }
  };

  const addNode = (item: NodeLibraryItem) => {
    const id = crypto.randomUUID();
    const anchor = nodes[nodes.length - 1];
    const anchorSize = anchor ? nodeDimensions(anchor) : { width: NODE_W, height: NODE_H };
    const x = anchor ? anchor.x + anchorSize.width + 90 : 420;
    const y = anchor ? anchor.y : 260;
    const config: Record<string, string> =
      item.name === "Send Gmail"
        ? { host: "smtp.gmail.com", port: "465", secure: "true", to: adminEmail }
        : item.name === "AI Message"
          ? { model: aiProvider.toLowerCase(), instruction: aiInstruction }
          : item.type === "logic"
            ? { condition: "status == Offline OR severity == Critical" }
            : {};
    setNodes((cur) => [...cur, { id, type: item.type, name: item.name, description: item.description, icon: item.icon, x, y, config }]);
    openNodeInspector(id);
  };

  const addDeviceNode = (device: DeviceEntry) => {
    const id = crypto.randomUUID();
    const anchor = nodes[nodes.length - 1];
    setNodes((cur) => [...cur, {
      id,
      type: "trigger",
      name: device.name,
      description: `${device.ip} · ${device.status}`,
      icon: device.type === "server" ? "server" : device.type === "switch" ? "switch" : "network",
      x: anchor ? anchor.x + NODE_W + 90 : 250,
      y: anchor ? anchor.y : 180,
      config: { deviceName: device.name, ipAddress: device.ip, deviceType: device.type },
    }]);
    openNodeInspector(id);
  };

  const insertAfter = (id: string) => {
    const index = nodes.findIndex((n) => n.id === id);
    if (index < 0) return;
    const anchor = nodes[index];
    const anchorSize = nodeDimensions(anchor);
    const item = nodeLibrary.find((n) => n.type === "action")!;
    const newId = crypto.randomUUID();
    setNodes((cur) => {
      const next = cur.map((n, i) => i > index ? { ...n, x: n.x + anchorSize.width + 90 } : n);
      next.splice(index + 1, 0, { id: newId, type: item.type, name: item.name, description: item.description, icon: item.icon, x: anchor.x + anchorSize.width + 90, y: anchor.y });
      return next;
    });
    openNodeInspector(newId);
  };

  const removeNode = (id: string) => {
    setNodes((cur) => {
      const next = cur.filter((n) => n.id !== id);
      if (!next.length) {
        setSelectedNode("");
        setRightOpen(false);
      } else if (id === selectedNode) setSelectedNode(next[0].id);
      return next;
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selectedNode || (e.key !== "Delete" && e.key !== "Backspace")) return;
      const target = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable) return;
      e.preventDefault();
      removeNode(selectedNode);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedNode]);

  const renameNode = (id: string, name: string) => {
    setNodes((cur) => cur.map((n) => n.id === id ? { ...n, name } : n));
  };

  const changeNodeConfig = (id: string, patch: Record<string, string>) => {
    setNodes((cur) => cur.map((n) => n.id === id ? { ...n, config: { ...n.config, ...patch } } : n));
  };

  const zoomAtCenter = (factor: number) => {
    const el = canvasRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const mx = rect.width / 2;
    const my = rect.height / 2;
    setViewport((v) => {
      const zoom = Math.min(1.8, Math.max(0.3, v.zoom * factor));
      const scale = zoom / v.zoom;
      return { zoom, x: mx - (mx - v.x) * scale, y: my - (my - v.y) * scale };
    });
  };

  const fitView = () => {
    const el = canvasRef.current;
    if (!el || !nodes.length) return;
    const rect = el.getBoundingClientRect();
    const minX = Math.min(...nodes.map((n) => n.x)) - 100;
    const maxX = Math.max(...nodes.map((n) => n.x + nodeDimensions(n).width)) + 100;
    const minY = Math.min(...nodes.map((n) => n.y)) - 100;
    const maxY = Math.max(...nodes.map((n) => n.y + nodeDimensions(n).height)) + 100;
    const zoom = Math.min(1.4, Math.max(0.3, Math.min(rect.width / (maxX - minX), rect.height / (maxY - minY))));
    setViewport({ zoom, x: (rect.width - (maxX - minX) * zoom) / 2 - minX * zoom, y: (rect.height - (maxY - minY) * zoom) / 2 - minY * zoom });
  };

  const executeWorkflow = async () => {
    setRunning(true);
    const executionId = crypto.randomUUID();
    const startedAt = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setExecutionHistory((cur) => [
      { id: executionId, time: startedAt, status: "Running", detail: `${nodes.length} nodes · ${workflowName}` },
      ...cur,
    ].slice(0, 12));
    try {
      const response = await fetch("/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "workflow.execute",
          payload: { workflowId: activeWorkflowId ?? "unsaved-workflow", organizationId, probe: "ping" },
        }),
      });
      const data = await response.json() as { executions?: Array<{ output?: { outcomes?: Array<{ deviceName?: string; status?: string; ok?: boolean; latencyMs?: number | null; packetLossPercent?: number }> } }>; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Execution endpoint returned an error");
      const outcomes = data.executions?.[0]?.output?.outcomes ?? [];
      const faulted = outcomes.filter((outcome) => outcome.status && outcome.status !== "Online");
      setExecutionHistory((cur) => cur.map((item) => item.id === executionId ? {
        ...item,
        status: "Success",
        detail: outcomes.length ? `${outcomes.length} devices probed · ${faulted.length} fault(s)` : "No registered devices to probe",
      } : item));
      showNotice(outcomes.length ? `Monitor cycle complete: ${outcomes.length} devices, ${faulted.length} fault(s).` : "No devices registered in the monitoring database yet.");
    } catch {
      setExecutionHistory((cur) => cur.map((item) => item.id === executionId ? { ...item, status: "Failed" } : item));
      showNotice("Workflow was saved locally, but the execution API could not be reached.");
    } finally {
      window.setTimeout(() => setRunning(false), 900);
    }
  };

  const refreshDevices = async () => {
    try {
      const response = await fetch("/api/monitoring/devices");
      if (!response.ok) return;
      const data = await response.json() as { devices?: Array<Record<string, unknown>> };
      if (!data.devices || !Array.isArray(data.devices)) return;
      setDevices(data.devices.map((device) => ({
        name: String(device.name ?? ""),
        ip: String(device.ip ?? ""),
        subnet: String(device.subnet ?? ""),
        mac: String(device.mac ?? ""),
        type: String(device.type ?? "router"),
        status: String(device.status ?? "Online"),
      })));
    } catch {
      /* if the API is unavailable, the local UI state remains as-is */
    }
  };

  const addDevice = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!deviceForm.name.trim() || !deviceForm.ip.trim()) return;
    const nextDevice = {
      name: deviceForm.name.trim(),
      ip: deviceForm.ip.trim(),
      subnet: deviceForm.subnet.trim(),
      mac: deviceForm.mac.trim(),
      type: deviceForm.type,
      status: "Online",
    };
    setDevices((cur) => [...cur, nextDevice]);
    setDeviceForm({ name: "", ip: "", subnet: "", mac: "", type: "router" });
    setDeviceFormOpen(false);
    void fetch("/api/monitoring/devices", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: nextDevice.name, ip: nextDevice.ip, subnet: nextDevice.subnet, mac: nextDevice.mac, type: nextDevice.type }),
    }).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String((data as { error?: string }).error ?? "Device could not be saved to the monitoring database."));
      await refreshDevices();
      showNotice(`${nextDevice.name} registered for monitoring.`);
    }).catch(() => showNotice("Device kept locally; the monitoring API was unreachable."));
  };

  const removeDevice = (ip: string) => {
    setDevices((cur) => cur.filter((d) => d.ip !== ip));
    void fetch(`/api/monitoring/devices?ip=${encodeURIComponent(ip)}`, { method: "DELETE" })
      .then(async (response) => {
        if (response.ok) await refreshDevices();
      })
      .catch(() => undefined);
  };

  const testDevice = (device: DeviceEntry) => {
    showNotice(`Testing ${device.name} (${device.ip})...`);
    void fetch("/api/monitoring/results", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ip: device.ip, probe: "ping" }),
    }).then(async (response) => {
      const data = await response.json().catch(() => ({})) as { outcome?: { status?: string; latencyMs?: number | null; packetLossPercent?: number }; error?: string };
      if (!response.ok || data.error) throw new Error(data.error ?? "Device test failed");
      const outcome = data.outcome;
      await refreshDevices();
      setDevices((cur) => cur.map((entry) => entry.ip === device.ip ? { ...entry, status: outcome?.status ?? entry.status } : entry));
      showNotice(`${device.name}: ${outcome?.status ?? "unknown"} · ${outcome?.latencyMs ?? "–"} ms · ${outcome?.packetLossPercent ?? 0}% loss`);
    }).catch(() => showNotice("Device test API unreachable."));
  };

  const saveSmtp = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    setSmtpState("Saving SMTP configuration...");
    try {
      const settingsResponse = await fetch("/api/monitoring/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          adminEmail: smtpRecipients || adminEmail,
          smtpHost: settingsState.smtpHost,
          smtpPort: Number(settingsState.smtpPort),
          smtpSecure: settingsState.smtpSecure,
          smtpUser: smtpUser || settingsState.smtpUser,
          smtpFrom: smtpFrom || settingsState.smtpFrom,
          ...(smtpAppPassword ? { smtpPassword: smtpAppPassword } : {}),
        }),
      });
      const data = await settingsResponse.json() as { settings?: Record<string, unknown>; error?: string };
      if (!settingsResponse.ok) throw new Error(data.error ?? "Settings endpoint rejected the update");
      const emailStatus = await fetch("/api/monitoring/email");
      const statusData = await emailStatus.json() as { smtpConfigured?: boolean; host?: string; port?: number; user?: string | null };
      setSettingsState((current) => ({ ...current, adminEmail: smtpRecipients || adminEmail, smtpUser: smtpUser || current.smtpUser, smtpFrom: smtpFrom || current.smtpFrom, smtpPassword: "", smtpPasswordConfigured: Boolean(data.settings?.smtpPasswordConfigured) }));
      setSmtpAppPassword("");
      setSmtpState(statusData.smtpConfigured
        ? `SMTP ready on ${statusData.host}:${statusData.port} as ${statusData.user}. Fault alerts will dispatch to ${smtpRecipients || adminEmail}.`
        : "SMTP settings saved. Enter the SMTP password/app password to enable delivery.");
    } catch (error) {
      setSmtpState(error instanceof Error ? error.message : "SMTP configuration could not be saved.");
    }
  };

  const saveMonitoringSettings = async (): Promise<boolean> => {
    const body: Record<string, unknown> = {
      intervalSeconds: Number(settingsState.pollingInterval),
      failureThreshold: Number(settingsState.failureThreshold),
      latencyWarningMs: Number(settingsState.latencyWarningMs),
      packetLossWarningPercent: Number(settingsState.packetLossWarningPercent),
      adminEmail: settingsState.adminEmail || smtpRecipients || currentUser.email || "",
      aiProvider: settingsState.aiProvider,
      aiModel: settingsState.aiModel,
      aiInstruction: settingsState.aiInstruction,
      smtpHost: settingsState.smtpHost,
      smtpPort: Number(settingsState.smtpPort),
      smtpSecure: settingsState.smtpSecure,
      smtpUser: settingsState.smtpUser,
      smtpFrom: settingsState.smtpFrom,
    };
    if (settingsState.aiApiKey.trim()) body.aiApiKey = settingsState.aiApiKey.trim();
    if (settingsState.smtpPassword.trim()) body.smtpPassword = settingsState.smtpPassword.trim();
    try {
      const response = await fetch("/api/monitoring/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json() as { settings?: Record<string, unknown>; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Settings could not be saved");
      setSettingsState((current) => ({
        ...current,
        aiApiKey: "",
        aiApiKeyConfigured: Boolean(data.settings?.aiApiKeyConfigured ?? current.aiApiKeyConfigured),
        aiProviderConfigurations: Array.isArray(data.settings?.aiProviderConfigurations)
          ? data.settings.aiProviderConfigurations as SettingsForm["aiProviderConfigurations"]
          : current.aiProviderConfigurations,
        smtpPassword: "",
        smtpPasswordConfigured: Boolean(data.settings?.smtpPasswordConfigured ?? current.smtpPasswordConfigured),
      }));
      monitoringSettingsDirty.current = false;
      setAiProvider(aiProviderLabel(settingsState.aiProvider));
      setAiInstruction(settingsState.aiInstruction);
      setAiModels((current) => ({ ...current, [aiProviderLabel(settingsState.aiProvider)]: settingsState.aiModel }));
      showNotice("Monitoring, alert severity, and AI email settings saved securely.");
      return true;
    } catch (error) {
      showNotice(error instanceof Error ? `Settings could not be saved: ${error.message}` : "Settings could not be saved.");
      return false;
    }
  };

  const sendTestEmail = async () => {
    const recipient = settingsState.adminEmail || currentUser.email || smtpRecipients;
    if (!recipient) {
      setEmailTestState("Set an administrator email address before sending a test.");
      return;
    }
    setEmailTestState(`Sending test email to ${recipient}...`);
    try {
      const saved = await saveMonitoringSettings();
      if (!saved) throw new Error("Could not save settings before testing SMTP.");
      const response = await fetch("/api/monitoring/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          to: recipient,
          subject: "[NetMoni] SMTP delivery test",
          message: "This is a test message from NetMoni. SMTP delivery is working.",
        }),
      });
      const data = await response.json() as { sent?: boolean; accepted?: string[]; error?: string };
      if (!response.ok || !data.sent) throw new Error(data.error ?? "SMTP test send failed");
      setEmailTestState(`Sent successfully to ${data.accepted?.join(", ") || recipient}.`);
    } catch (error) {
      setEmailTestState(error instanceof Error ? error.message : "SMTP test send failed.");
    }
  };

  const previewAiEmail = async () => {
    const device = devices[0];
    if (!device) {
      setAiTestState("Add a device before previewing a fault email.");
      setAiPreview(null);
      return;
    }
    setAiTestState("Composing preview from the latest device checks...");
    try {
      const response = await fetch("/api/monitoring/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          deviceName: device.name,
          ipAddress: device.ip,
          status: device.status === "Online" ? "Warning" : device.status,
          severity: device.status === "Offline" ? "critical" : "warning",
          probe: "ping",
          provider: settingsState.aiProvider,
          model: settingsState.aiModel,
          instruction: settingsState.aiInstruction,
        }),
      });
      const data = await response.json() as { message?: { subject: string; body: string; provider: string; model: string; synthesized: boolean }; error?: string };
      if (!response.ok || !data.message) throw new Error(data.error ?? "AI preview failed");
      setAiPreview(data.message);
      setAiTestState(data.message.synthesized ? "Preview composed successfully. No email was sent." : "Provider was unavailable or no API key is configured; showing the rule-based fallback.");
    } catch (error) {
      setAiPreview(null);
      setAiTestState(error instanceof Error ? error.message : "AI preview failed.");
    }
  };

  /* ---------------- auth / org flows: unchanged API process ---------------- */
  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEntryBusy(true);
    setEntryError("");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = (await response.json()) as {
      user?: { name: string; email: string };
      organization?: { id: string; name: string };
      session?: { workspaceId: string };
      error?: string;
    };
    if (!response.ok || !data.session) {
      setEntryError("Enter an email and password to continue.");
      setEntryBusy(false);
      return;
    }
    setOrganizationId(data.session.workspaceId);
    if (data.user) {
      setCurrentUser(data.user);
      if (data.user.email) setSmtpRecipients(data.user.email);
    }
    if (data.organization) setOrganizationName(data.organization.name);
    setEntryStage("editor");
    setEntryBusy(false);
  };

  const createOrganization = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEntryBusy(true);
    setEntryError("");
    const response = await fetch("/api/organizations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: organizationName,
        ownerName,
        ownerEmail,
        ownerPassword,
        confirmPassword: confirmOwnerPassword,
      }),
    });
    const data = (await response.json()) as {
      organization?: { id: string };
      owner?: { name: string; email: string };
      error?: string;
    };
    if (!response.ok || !data.organization) {
      setEntryError(data.error ?? "Could not create organization.");
      setEntryBusy(false);
      return;
    }
    setOrganizationId(data.organization.id);
    if (data.owner) {
      setCurrentUser(data.owner);
      if (data.owner.email) setSmtpRecipients(data.owner.email);
    }
    setEntryStage("editor");
    setEntryBusy(false);
  };

  const setEntryField = (field: EntryField, value: string) => {
    switch (field) {
      case "email": setEmail(value); break;
      case "password": setPassword(value); break;
      case "organizationName": setOrganizationName(value); break;
      case "ownerName": setOwnerName(value); break;
      case "ownerEmail": setOwnerEmail(value); break;
      case "ownerPassword": setOwnerPassword(value); break;
      case "confirmOwnerPassword": setConfirmOwnerPassword(value); break;
    }
  };

  /* ---------------- workflow library persistence (database-backed) ---------------- */
  const persistWorkflowLibrary = (next: SavedWorkflow[]) => setWorkflowLibrary(next);

  /** Best-effort server copy so saved workflows are inspectable via the API. */
  const syncWorkflowToServer = async (workflow: SavedWorkflow) => {
    try {
      const triggerNode = workflow.nodes.find((node) => node.type === "trigger");
      await fetch("/api/automations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: workflow.id,
          name: workflow.name,
          description: `${workflow.nodes.length} node network automation saved from the workflow editor.`,
          trigger: { event: triggerNode?.config?.event ?? "fault" },
          enabled: workflow.published,
          nodes: workflow.nodes.map((node) => ({
            id: node.id,
            kind: node.type,
            name: node.name,
            ...(node.icon ? { icon: node.icon } : {}),
            ...(node.config ? { config: node.config } : {}),
          })),
        }),
      });
    } catch {
      /* the local library stays the source of truth when the API is unreachable */
    }
  };

  const handleWorkflowNameChange = (value: string) => {
    setWorkflowName(value);
    if (nameInvalid && value.trim()) setNameInvalid(false);
  };

  const createWorkflow = () => {
    setActiveWorkflowId(null);
    setWorkflowName("");
    setNameInvalid(false);
    setNodes([]);
    setSelectedNode("");
    setPublished(false);
    setViewport(DEFAULT_VIEWPORT);
    setLeftOpen(true);
    setRightOpen(false);
    setWorkflowView("editor");
    setSavedSnapshot(null);
  };

  const openWorkflow = (workflow: SavedWorkflow) => {
    setActiveWorkflowId(workflow.id);
    setWorkflowName(workflow.name);
    setNameInvalid(false);
    setNodes(workflow.nodes ?? []);
    setSelectedNode(workflow.nodes?.[0]?.id ?? "");
    setPublished(Boolean(workflow.published));
    setViewport(DEFAULT_VIEWPORT);
    setLeftOpen(true);
    setRightOpen(Boolean(workflow.nodes?.length));
    setWorkflowView("editor");
    setSavedSnapshot(JSON.stringify({ nodes: workflow.nodes ?? [], workflowName: workflow.name, published: Boolean(workflow.published) }));
  };

  /** Saves the current workflow under its name. Returns false when unnamed. */
  const saveCurrentWorkflow = (): boolean => {
    const name = workflowName.trim();
    if (!name) {
      setNameInvalid(true);
      showNotice("Name your workflow before saving.");
      return false;
    }
    const now = new Date().toISOString();
    const id = activeWorkflowId ?? crypto.randomUUID();
    const existing = workflowLibrary.find((workflow) => workflow.id === id);
    const saved: SavedWorkflow = {
      id,
      name,
      nodes,
      published,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const next = [saved, ...workflowLibrary.filter((workflow) => workflow.id !== id)];
    setActiveWorkflowId(id);
    setWorkflowName(name);
    setNameInvalid(false);
    persistWorkflowLibrary(next);
    setSavedSnapshot(JSON.stringify({ nodes, workflowName: name, published }));
    showNotice("Workflow saved.");
    void syncWorkflowToServer(saved);
    return true;
  };

  const saveNodeConfiguration = (nodeName: string) => {
    if (!saveCurrentWorkflow()) return;
    showNotice(`${nodeName} configuration saved.`);
  };

  const deleteWorkflow = (id: string) => {
    const next = workflowLibrary.filter((workflow) => workflow.id !== id);
    persistWorkflowLibrary(next);
    void fetch(`/api/automations?id=${encodeURIComponent(id)}`, { method: "DELETE" })
      .then((response) => {
        if (!response.ok) throw new Error("Delete failed");
        if (activeWorkflowId === id) {
          setActiveWorkflowId(null);
          setSavedSnapshot(null);
          setWorkflowView("library");
          setNodes([]);
          setSelectedNode("");
        }
        showNotice("Workflow deleted.");
      })
      .catch(() => showNotice("Workflow removed from the editor, but the server delete request failed."));
  };

  const duplicateWorkflow = (workflow: SavedWorkflow) => {
    const copy: SavedWorkflow = {
      ...workflow,
      id: crypto.randomUUID(),
      name: `${workflow.name} copy`,
      nodes: workflow.nodes.map((node) => ({ ...node, id: crypto.randomUUID() })),
      published: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    persistWorkflowLibrary([copy, ...workflowLibrary]);
    showNotice("Workflow duplicated.");
  };

  /* ---------------- AI + SMTP inspector controllers ---------------- */
  const aiController = {
    provider: aiProvider,
    models: aiModels,
    keys: aiKeys,
    keyConfigured: Boolean(settingsState.aiProviderConfigurations.find((configuration) => configuration.provider === aiProvider.toLowerCase())?.apiKeyConfigured),
    baseUrls: aiBaseUrls,
    keyState: aiKeyState,
    instruction: aiInstruction,
    onProviderChange: (nodeId: string, provider: string) => {
      setAiProvider(provider);
      setAiKeyState("");
      const normalizedProvider = provider.toLowerCase();
      const savedConfiguration = settingsState.aiProviderConfigurations.find((configuration) => configuration.provider === normalizedProvider);
      const selectedModel = savedConfiguration?.model ?? aiModels[provider] ?? "";
      setSettingsState((current) => ({
        ...current,
        aiProvider: normalizedProvider,
        aiModel: selectedModel,
        aiApiKeyConfigured: Boolean(savedConfiguration?.apiKeyConfigured),
      }));
      monitoringSettingsDirty.current = true;
      setNodes((cur) => cur.map((n) => n.id === nodeId
        ? { ...n, config: { ...n.config, provider, model: aiModels[provider] ?? "" } }
        : n
      ));
    },
    onKeyChange: (nodeId: string, value: string) => {
      setAiKeys((cur) => ({ ...cur, [aiProvider]: value }));
      setAiKeyState("");
      setNodes((cur) => cur.map((n) => n.id === nodeId
        ? { ...n, config: { ...n.config, provider: aiProvider, hasApiKey: value ? "true" : "false" } }
        : n
      ));
    },
    onModelChange: (nodeId: string, model: string) => {
      setAiModels((cur) => ({ ...cur, [aiProvider]: model }));
      setSettingsState((current) => ({ ...current, aiModel: model }));
      monitoringSettingsDirty.current = true;
      setNodes((cur) => cur.map((n) => n.id === nodeId
        ? { ...n, config: { ...n.config, provider: aiProvider, model } }
        : n
      ));
    },
    onBaseUrlChange: (value: string) => setAiBaseUrls({ Custom: value }),
    onInstructionChange: (nodeId: string, value: string) => {
      setAiInstruction(value);
      setSettingsState((current) => ({ ...current, aiInstruction: value }));
      monitoringSettingsDirty.current = true;
      setNodes((cur) => cur.map((n) => n.id === nodeId
        ? { ...n, config: { ...n.config, instruction: value } }
        : n
      ));
    },
    onSaveKey: async () => {
      const apiKey = aiKeys[aiProvider]?.trim();
      const selectedProviderConfigured = settingsState.aiProviderConfigurations.some((configuration) => configuration.provider === aiProvider.toLowerCase() && configuration.apiKeyConfigured);
      if (!apiKey && !selectedProviderConfigured) {
        setAiKeyState("Enter an API key before saving this AI connection.");
        return;
      }
      setAiKeyState("Saving AI settings...");
      try {
        const response = await fetch("/api/monitoring/settings", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            aiProvider: aiProvider.toLowerCase(),
            aiModel: aiModels[aiProvider] ?? "",
            aiInstruction,
            ...(apiKey ? { aiApiKey: apiKey } : {}),
          }),
        });
        const data = await response.json() as { settings?: Record<string, unknown>; error?: string };
        if (!response.ok) throw new Error(data.error ?? "AI settings could not be saved");
        setSettingsState((current) => ({
          ...current,
          aiProvider: aiProvider.toLowerCase(),
          aiModel: aiModels[aiProvider] ?? "",
          aiInstruction,
          aiApiKey: "",
          aiApiKeyConfigured: Boolean(data.settings?.aiApiKeyConfigured ?? current.aiApiKeyConfigured),
          aiProviderConfigurations: Array.isArray(data.settings?.aiProviderConfigurations)
            ? data.settings.aiProviderConfigurations as SettingsForm["aiProviderConfigurations"]
            : current.aiProviderConfigurations,
        }));
        setAiKeys((current) => ({ ...current, [aiProvider]: "" }));
        setAiKeyState(`Saved ${aiProvider} settings for this organization.`);
        monitoringSettingsDirty.current = false;
      } catch (error) {
        setAiKeyState(error instanceof Error ? error.message : "AI settings could not be saved.");
      }
    },
  };

  const smtpController = {
    host: settingsState.smtpHost,
    port: settingsState.smtpPort,
    secure: settingsState.smtpSecure,
    user: smtpUser,
    appPassword: smtpAppPassword,
    passwordConfigured: settingsState.smtpPasswordConfigured,
    from: smtpFrom,
    recipients: smtpRecipients,
    state: smtpState,
    adminEmail,
    onUserChange: setSmtpUser,
    onAppPasswordChange: setSmtpAppPassword,
    onFromChange: setSmtpFrom,
    onRecipientsChange: setSmtpRecipients,
    onSubmit: saveSmtp,
  };

  /* ---------------- dashboard sections ---------------- */
  const renderPage = () => {
    if (activeSection === "Workflows") {
      if (workflowView === "library") {
        return (
          <WorkflowLibrary
            workflows={workflowLibrary}
            search={workflowSearch}
            onSearchChange={setWorkflowSearch}
            onCreate={createWorkflow}
            onOpen={openWorkflow}
            onDuplicate={duplicateWorkflow}
            onDelete={deleteWorkflow}
          />
        );
      }
      return (
        <WorkflowEditor
          canvasRef={canvasRef}
          nodes={nodes}
          selectedId={selectedNode}
          running={running}
          viewport={viewport}
          leftOpen={leftOpen}
          search={search}
          devices={devices}
          library={filteredLibrary}
          onSearchChange={setSearch}
          onCloseLibrary={() => setLeftOpen(false)}
          onReopenLibrary={() => setLeftOpen(true)}
          onCanvasPointerDown={onCanvasPointerDown}
          onCanvasPointerMove={onPointerMove}
          onCanvasPointerUp={() => { dragRef.current = null; }}
          onNodePointerDown={onNodePointerDown}
          onAddNode={addNode}
          onAddDeviceNode={addDeviceNode}
          onInsertAfter={insertAfter}
          onRemoveNode={removeNode}
          onZoom={zoomAtCenter}
          onFitView={fitView}
          onResetViewport={() => setViewport(DEFAULT_VIEWPORT)}
          inspector={rightOpen && selected ? (
            <NodeInspector
              node={selected}
              tab={inspectorTab}
              onTabChange={setInspectorTab}
              onRename={renameNode}
              onConfigChange={changeNodeConfig}
              onClose={closeNodeInspector}
              onSaveNode={saveNodeConfiguration}
              ai={aiController}
              smtp={smtpController}
            />
          ) : undefined}
        />
      );
    }

    if (activeSection === "Devices") {
      return (
        <DevicesPanel
          devices={devices}
          results={backendResults}
          formOpen={deviceFormOpen}
          form={deviceForm}
          onOpenForm={() => setDeviceFormOpen(true)}
          onCloseForm={() => setDeviceFormOpen(false)}
          onFormChange={(patch) => setDeviceForm((current) => ({ ...current, ...patch }))}
          onSubmit={addDevice}
          onRemove={removeDevice}
          onTest={testDevice}
        />
      );
    }

    if (activeSection === "Alerts") return <AlertsPanel devices={devices} alerts={backendAlerts} />;

    if (activeSection === "Executions") return <ExecutionsPanel results={backendResults} history={executionHistory} />;

    if (activeSection === "Settings") {
      return (
        <SettingsPanel
          settings={settingsState}
          onSettingsChange={(patch) => {
            monitoringSettingsDirty.current = true;
            setSettingsState((current) => ({
              ...current,
              ...patch,
              ...(patch.aiProvider !== undefined
                ? { aiApiKeyConfigured: Boolean(current.aiProviderConfigurations.find((configuration) => configuration.provider === patch.aiProvider)?.apiKeyConfigured) }
                : {}),
            }));
            if (patch.aiProvider !== undefined) setAiProvider(aiProviderLabel(patch.aiProvider));
            if (patch.aiModel !== undefined) setAiModels((current) => ({ ...current, [aiProviderLabel(settingsState.aiProvider)]: patch.aiModel ?? "" }));
            if (patch.aiInstruction !== undefined) setAiInstruction(patch.aiInstruction);
            if (patch.smtpUser !== undefined) setSmtpUser(patch.smtpUser);
            if (patch.smtpFrom !== undefined) setSmtpFrom(patch.smtpFrom);
            if (patch.adminEmail !== undefined) setSmtpRecipients(patch.adminEmail);
          }}
          workflowName={workflowName}
          onWorkflowNameChange={handleWorkflowNameChange}
          onSaveSettings={saveMonitoringSettings}
          onTestAi={previewAiEmail}
          onTestEmail={sendTestEmail}
          emailTestState={emailTestState}
          aiTestState={aiTestState}
          aiPreview={aiPreview}
        />
      );
    }

    return <OverviewPanel onOpenWorkflows={() => setActiveSection("Workflows")} />;
  };

  /* ---------------- entry screens ---------------- */
  if (entryStage !== "editor") {
    return (
      <EntryScreen
        stage={entryStage}
        fields={{
          email,
          password,
          organizationName,
          ownerName,
          ownerEmail,
          ownerPassword,
          confirmOwnerPassword,
        }}
        onField={setEntryField}
        error={entryError}
        busy={entryBusy}
        onLogin={login}
        onCreateOrganization={createOrganization}
        onStartOrganization={() => { setEntryStage("organization"); setEntryError(""); }}
        onBackToLogin={() => setEntryStage("login")}
      />
    );
  }

  return (
    <>
      <DashboardStyles />
      <DashboardFrame
        theme={theme}
        onToggleTheme={toggleTheme}
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        organizationName={organizationName}
        user={currentUser}
        workflowView={workflowView}
        workflowName={workflowName}
        nameInvalid={nameInvalid}
        onWorkflowNameChange={handleWorkflowNameChange}
        saveState={saveState}
        published={published}
        running={running}
        notice={uiNotice}
        onBackToLibrary={() => setWorkflowView("library")}
        onCreateWorkflow={createWorkflow}
        onSaveWorkflow={() => { saveCurrentWorkflow(); }}
        onTogglePublished={() => setPublished(!published)}
        onExecute={executeWorkflow}
      >
        {renderPage()}
      </DashboardFrame>
    </>
  );
}
