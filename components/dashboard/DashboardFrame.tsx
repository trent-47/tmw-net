"use client";

import type { ReactNode } from "react";
import { Activity, ArrowRight, Bell, CircleHelp, FileText, Globe2, Network, Play, Plus, Settings, Workflow, Zap } from "lucide-react";
import type { EditorSection } from "./types";

type Props = {
  theme: "dark" | "light";
  onToggleTheme: () => void;
  activeSection: EditorSection;
  onSelectSection: (section: EditorSection) => void;
  organizationName: string;
  user: { name: string; email: string };
  workflowView: "library" | "editor";
  workflowName: string;
  nameInvalid: boolean;
  onWorkflowNameChange: (value: string) => void;
  saveState: "saved" | "saving";
  published: boolean;
  running: boolean;
  notice: string;
  onBackToLibrary: () => void;
  onCreateWorkflow: () => void;
  onSaveWorkflow: () => void;
  onTogglePublished: () => void;
  onExecute: () => void;
  children: ReactNode;
};

const railIcons: Record<EditorSection, ReactNode> = {
  Overview: <Activity size={18} />,
  Workflows: <Workflow size={18} />,
  Executions: <Zap size={18} />,
  Devices: <Network size={18} />,
  Alerts: <Bell size={18} />,
  Reports: <FileText size={18} />,
  Settings: <Settings size={18} />,
};

/**
 * Dashboard frame: left rail, workspace header, section tabs and the content
 * slot every dashboard page renders into.
 */
export function DashboardFrame({
  theme,
  onToggleTheme,
  activeSection,
  onSelectSection,
  organizationName,
  user,
  workflowView,
  workflowName,
  nameInvalid,
  onWorkflowNameChange,
  saveState,
  published,
  running,
  notice,
  onBackToLibrary,
  onCreateWorkflow,
  onSaveWorkflow,
  onTogglePublished,
  onExecute,
  children,
}: Props) {
  const sections: EditorSection[] = ["Overview", "Workflows", "Executions", "Devices", "Alerts", "Reports", "Settings"];
  return (
    <div className={`app-shell network-theme-${theme}`}>
      {notice && <div className="ui-notice" role="status">{notice}</div>}
      <aside className="app-rail">
        <div className="rail-brand"><div className="netmoni-logo">N</div></div>
        <nav className="rail-nav">
          {sections.map((section) => (
            <button key={section} className={`rail-item ${activeSection === section ? "active" : ""}`} onClick={() => onSelectSection(section)} title={section}>
              <span>{railIcons[section]}</span>
            </button>
          ))}
        </nav>
        <div className="rail-spacer" />
        <button className="rail-item" title="Help"><span><CircleHelp size={18} /></span></button>
        <div className="rail-user" title={user.email || "Owner"}>{(user.name || "Owner").split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()}</div>
      </aside>

      <main className="editor-main">
        <header className={`editor-header ${workflowView === "library" ? "library-header" : "workflow-editor-header"}`}>
          <div className="header-left">
            <div className="crumb"><span>{organizationName || "Organization"}</span><span className="crumb-sep">/</span><span>Workflows</span>{workflowView === "editor" && <><span className="crumb-sep">/</span><span>{workflowName || "Untitled workflow"}</span></>}</div>
            {workflowView === "editor" ? (
              <div className="wf-title-row">
                <button className="back-workflows" type="button" onClick={onBackToLibrary} title="Back to workflows"><ArrowRight size={15} style={{ transform: "rotate(180deg)" }} /></button>
                <input className={`wf-name-input ${nameInvalid ? "name-missing" : ""}`} value={workflowName} onChange={(e) => onWorkflowNameChange(e.target.value)} placeholder="Untitled workflow" spellCheck={false} />
                <span className={`save-state ${saveState}`}><i />{saveState === "saved" ? "Saved" : "Unsaved changes"}</span>
              </div>
            ) : (
              <div className="wf-title-row"><strong className="workspace-title">Workflow library</strong></div>
            )}
          </div>
          <div className="header-actions">
            <button className="btn ghost theme-toggle" onClick={onToggleTheme} title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
              {theme === "dark" ? <Globe2 size={15} /> : <Zap size={15} />}
              {theme === "dark" ? "Light" : "Dark"}
            </button>
            {workflowView === "library" ? (
              <button className="btn primary" type="button" onClick={onCreateWorkflow}><Plus size={15} /> Create workflow</button>
            ) : (
              <>
                <button className="btn ghost" type="button" onClick={onBackToLibrary}>Workflows</button>
                <button className="btn ghost" type="button" onClick={onSaveWorkflow}>Save</button>
                <button className={`btn ghost ${published ? "is-published" : ""}`} onClick={onTogglePublished}>{published ? "● Published" : "Publish"}</button>
                <button className="btn primary" onClick={onExecute} disabled={running}><span className="play-icon">{running ? <Activity size={15} /> : <Play size={14} fill="currentColor" />}</span>{running ? "Executing…" : "Test workflow"}</button>
              </>
            )}
          </div>
        </header>

        <div className="editor-tabs">
          {(["Workflows", "Executions", "Devices", "Alerts", "Reports"] as EditorSection[]).map((tab) => (
            <button key={tab} className={`editor-tab ${activeSection === tab ? "active" : ""}`} onClick={() => onSelectSection(tab)}>
              {tab === "Workflows" ? "Workflows" : tab}
            </button>
          ))}
        </div>

        {children}
      </main>
    </div>
  );
}
