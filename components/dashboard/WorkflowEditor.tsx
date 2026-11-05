"use client";

import type { PointerEvent as ReactPointerEvent, ReactNode, RefObject } from "react";
import { Network, Plus, Workflow, X } from "lucide-react";
import { DeviceGlyph, NodeGlyph, edgePath, nodeDimensions, typeLabel } from "./node-canvas";
import type { DeviceEntry, NodeLibraryItem, Viewport, WorkflowNode } from "./types";

type Props = {
  canvasRef: RefObject<HTMLDivElement | null>;
  nodes: WorkflowNode[];
  selectedId: string;
  running: boolean;
  runningNodeId: string;
  completedTestNodeIds: string[];
  viewport: Viewport;
  leftOpen: boolean;
  search: string;
  devices: DeviceEntry[];
  library: NodeLibraryItem[];
  inspector?: ReactNode;
  onSearchChange: (value: string) => void;
  onCloseLibrary: () => void;
  onReopenLibrary: () => void;
  onCanvasPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onCanvasPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onCanvasPointerUp: () => void;
  onNodePointerDown: (event: ReactPointerEvent, node: WorkflowNode) => void;
  onAddNode: (item: NodeLibraryItem) => void;
  onAddDeviceNode: (device: DeviceEntry) => void;
  onInsertAfter: (id: string) => void;
  onRemoveNode: (id: string) => void;
  onZoom: (factor: number) => void;
  onFitView: () => void;
  onResetViewport: () => void;
};

/** Workflow editor body: node library, drag-and-drop canvas and inspector slot. */
export function WorkflowEditor({
  canvasRef,
  nodes,
  selectedId,
  running,
  runningNodeId,
  completedTestNodeIds,
  viewport,
  leftOpen,
  search,
  devices,
  library,
  inspector,
  onSearchChange,
  onCloseLibrary,
  onReopenLibrary,
  onCanvasPointerDown,
  onCanvasPointerMove,
  onCanvasPointerUp,
  onNodePointerDown,
  onAddNode,
  onAddDeviceNode,
  onInsertAfter,
  onRemoveNode,
  onZoom,
  onFitView,
  onResetViewport,
}: Props) {
  return (
    <div className="editor-body">
      {leftOpen && (
        <aside className="nodes-panel">
          <div className="nodes-panel-head">
            <strong>Network nodes</strong>
            <button className="icon-btn" onClick={onCloseLibrary} title="Hide node library"><X size={16} /></button>
          </div>
          <div className="nodes-search">
            <span>⌕</span>
            <input placeholder="Search network nodes..." value={search} onChange={(e) => onSearchChange(e.target.value)} />
          </div>
          <div className="nodes-panel-body">
            <div className="device-library-section">
              <div className="nodes-section-title device-library-title">
                <span>Registered devices</span>
                <small>{devices.length}</small>
              </div>
              {devices.map((device) => (
                <button
                  className={`node-item device-library-item ${device.status.toLowerCase()}`}
                  key={device.ip}
                  onClick={() => onAddDeviceNode(device)}
                >
                  <span className={`device-library-icon ${device.status.toLowerCase()}`}>
                    <DeviceGlyph type={device.type} size={17} />
                  </span>
                  <span className="node-item-text">
                    <strong>{device.name}</strong>
                    <small>{device.ip}</small>
                  </span>
                  <span className={`device-dot ${device.status.toLowerCase()}`} />
                </button>
              ))}
              {!devices.length && <div className="device-library-empty">Add devices from the Devices page.</div>}
            </div>

            {(["trigger", "logic", "action"] as NodeLibraryItem["type"][]).map((type) => {
              const items = library.filter((n) => n.type === type);
              if (!items.length) return null;
              return (
                <div key={type}>
                  <div className="nodes-section-title">
                    {type === "trigger" ? "Network triggers" : type === "logic" ? "Conditions & routing" : "Network actions"}
                  </div>
                  {items.map((item) => (
                    <button className="node-item" key={item.name} onClick={() => onAddNode(item)}>
                      <span className={`node-icon type-${item.type}`}><NodeGlyph icon={item.icon} size={17} /></span>
                      <span className="node-item-text">
                        <strong>{item.name}</strong>
                        <small>{item.description}</small>
                      </span>
                      <span className="node-item-plus">+</span>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </aside>
      )}

      <div
        ref={canvasRef}
        className={`canvas ${running ? "is-running" : ""}`}
        onPointerDown={onCanvasPointerDown}
        onPointerMove={onCanvasPointerMove}
        onPointerUp={onCanvasPointerUp}
      >
        {!nodes.length && (
          <div className="canvas-empty-state">
            <div className="canvas-empty-mark"><Workflow size={25} /></div>
            <h2>Your workflow is empty</h2>
            <p>Add a network trigger from the node library to start building your automation.</p>
            <button type="button" className="btn primary" onClick={onReopenLibrary}><Plus size={15} /> Add first node</button>
          </div>
        )}
        <div className="canvas-viewport" style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}>
          <svg className="edges-layer">
            {nodes.slice(0, -1).map((node, i) => {
              const next = nodes[i + 1];
              const size = nodeDimensions(node);
              const nextSize = nodeDimensions(next);
              const d = edgePath(node.x + size.width, node.y + size.height / 2, next.x, next.y + nextSize.height / 2);
              return (
                <g key={node.id}>
                    <path d={d} className={`edge-path ${running && (runningNodeId === next.id || completedTestNodeIds.includes(next.id)) ? "running" : ""}`} />
                  {running && (runningNodeId === next.id || completedTestNodeIds.includes(next.id)) && <circle r={5} className="edge-pulse"><animateMotion dur="1.1s" repeatCount="indefinite" path={d} /></circle>}
                </g>
              );
            })}
          </svg>

          {nodes.map((node) => {
            const wide = node.icon === "ai";
            const { width: nodeWidth, height: nodeHeight } = nodeDimensions(node);
            return (
              <div
                key={node.id}
                className={`wf-node wf-node-compact ${wide ? "wf-node-agent" : "wf-node-card"} type-${node.type} ${selectedId === node.id ? "selected" : ""} ${running && runningNodeId === node.id ? "running" : ""} ${completedTestNodeIds.includes(node.id) ? "test-complete" : ""}`}
                style={{ left: node.x, top: node.y, width: nodeWidth, height: nodeHeight }}
                onPointerDown={(e) => onNodePointerDown(e, node)}
                title={`${node.name} — ${node.description}`}
                aria-label={`${node.name}. ${node.description}`}
              >
                <span className="handle handle-in" />
                <div className="wf-node-surface">
                  <span className={`wf-node-icon type-${node.type}`}><NodeGlyph icon={node.icon} size={wide ? 30 : 34} /></span>
                  {wide && (
                    <div className="wf-node-agent-copy">
                      <strong>{node.name}</strong>
                      <small>AI-assisted network diagnosis</small>
                    </div>
                  )}
                  {running && runningNodeId === node.id && <span className="wf-node-pulse" />}
                </div>
                {!wide && <div className="wf-node-label">{node.name}</div>}
                {wide && (
                  <div className="wf-node-ports">
                    <span>AI Provider</span>
                    <span>Tools</span>
                  </div>
                )}

                <div className="wf-node-hover-card">
                  <div className="wf-node-hover-top">
                    <span className="wf-node-hover-icon"><NodeGlyph icon={node.icon} size={18} /></span>
                    <div><strong>{node.name}</strong><small>{typeLabel(node.type)} node</small></div>
                  </div>
                  <p>{node.description}</p>
                  {node.name === "Send Gmail" && <span className="wf-node-hover-meta">Google SMTP · Nodemailer</span>}
                  {node.name === "AI Message" && <span className="wf-node-hover-meta">AI provider · API key</span>}
                </div>

                <button className="node-delete node-delete-compact" aria-label={`Delete ${node.name}`} onPointerDown={(e) => e.stopPropagation()} onClick={() => onRemoveNode(node.id)}>
                  <X size={12} />
                </button>
                <span className="handle handle-out" />
                <button className="quick-add quick-add-compact" aria-label={`Add node after ${node.name}`} onPointerDown={(e) => e.stopPropagation()} onClick={() => onInsertAfter(node.id)}>
                  <Plus size={12} />
                </button>
              </div>
            );
          })}

        </div>

        {!leftOpen && <button className="reopen-library" onClick={onReopenLibrary} title="Show node library"><Network size={15} /> Nodes</button>}
        <div className="canvas-workflow-badge"><span className="canvas-live-dot" /> Live network workflow</div>
        <div className="canvas-controls">
          <button onClick={() => onZoom(1.2)}>+</button>
          <button onClick={() => onZoom(1 / 1.2)}>−</button>
          <span className="zoom-readout">{Math.round(viewport.zoom * 100)}%</span>
          <button onClick={onFitView}>⛶</button>
          <button onClick={onResetViewport}>1:1</button>
        </div>
        <div className="canvas-hint">
          <span><kbd>Scroll</kbd> zoom</span>
          <span><kbd>Drag</kbd> pan / move</span>
          <span><kbd>Del</kbd> remove</span>
        </div>
      </div>

      {inspector}
    </div>
  );
}
