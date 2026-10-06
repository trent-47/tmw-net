import { relations } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * NetMoni — unified PostgreSQL schema (Drizzle ORM).
 *
 * One database, one schema. Every tenant-owned row carries `organization_id`
 * so the same Postgres URL scales to any number of organizations.
 */

/* ------------------------------------------------------------------ */
/* Identity & tenancy                                                  */
/* ------------------------------------------------------------------ */

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    emailUnique: uniqueIndex("users_email_unique").on(table.email),
  }),
);

export const organizations = pgTable(
  "organizations",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    ownerIdx: index("organizations_owner_idx").on(table.ownerId),
  }),
);

export const organizationMembers = pgTable(
  "organization_members",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.organizationId, table.userId] }),
    userIdx: index("organization_members_user_idx").on(table.userId),
  }),
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tokenHashUnique: uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
    userIdx: index("sessions_user_idx").on(table.userId),
  }),
);

/* ------------------------------------------------------------------ */
/* Monitoring (organization-scoped)                                    */
/* ------------------------------------------------------------------ */

export const networkDevices = pgTable(
  "network_devices",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    ip: text("ip").notNull(),
    subnet: text("subnet").notNull().default(""),
    mac: text("mac").notNull().default(""),
    type: text("type").notNull().default("router"),
    status: text("status").notNull().default("Online"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index("network_devices_org_idx").on(table.organizationId),
    orgIpUnique: uniqueIndex("network_devices_org_ip_unique").on(table.organizationId, table.ip),
  }),
);

export const monitoringChecks = pgTable(
  "monitoring_checks",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    deviceId: text("device_id")
      .notNull()
      .references(() => networkDevices.id, { onDelete: "cascade" }),
    deviceName: text("device_name").notNull(),
    ipAddress: text("ip_address").notNull(),
    probe: text("probe").notNull(),
    ok: boolean("ok").notNull(),
    latencyMs: doublePrecision("latency_ms"),
    packetLoss: doublePrecision("packet_loss").notNull().default(0),
    bandwidthIn: doublePrecision("bandwidth_in"),
    bandwidthOut: doublePrecision("bandwidth_out"),
    detail: text("detail"),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    deviceTimeIdx: index("monitoring_checks_device_time_idx").on(table.deviceId, table.checkedAt),
    orgTimeIdx: index("monitoring_checks_org_time_idx").on(table.organizationId, table.checkedAt),
  }),
);

export const monitoringAlerts = pgTable(
  "monitoring_alerts",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    deviceId: text("device_id")
      .notNull()
      .references(() => networkDevices.id, { onDelete: "cascade" }),
    deviceName: text("device_name").notNull(),
    ipAddress: text("ip_address").notNull(),
    severity: text("severity").notNull(),
    status: text("status").notNull(),
    summary: text("summary").notNull(),
    recommendation: text("recommendation").notNull().default(""),
    evidence: jsonb("evidence").notNull().default({}),
    emailStatus: text("email_status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgTimeIdx: index("monitoring_alerts_org_time_idx").on(table.organizationId, table.createdAt),
  }),
);

export const monitoringSettings = pgTable(
  "monitoring_settings",
  {
    organizationId: text("organization_id")
      .primaryKey()
      .references(() => organizations.id, { onDelete: "cascade" }),
    intervalSeconds: integer("interval_seconds").notNull().default(30),
    failureThreshold: integer("failure_threshold").notNull().default(3),
    latencyWarningMs: integer("latency_warning_ms").notNull().default(500),
    packetLossWarning: doublePrecision("packet_loss_warning").notNull().default(10),
    bandwidthWarning: doublePrecision("bandwidth_warning").notNull().default(0),
    adminEmail: text("admin_email").notNull().default(""),
    aiProvider: text("ai_provider").notNull().default("gemini"),
    aiInstruction: text("ai_instruction").notNull().default(""),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // monitoring_settings PK is organization_id; no extra index needed.
  }),
);

export const aiProviderCredentials = pgTable(
  "ai_provider_credentials",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    apiKeyEncrypted: text("api_key_encrypted"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.organizationId, table.provider] }),
  }),
);

export const organizationSmtpSettings = pgTable(
  "organization_smtp_settings",
  {
    organizationId: text("organization_id")
      .primaryKey()
      .references(() => organizations.id, { onDelete: "cascade" }),
    host: text("host").notNull().default("smtp.gmail.com"),
    port: integer("port").notNull().default(465),
    secure: boolean("secure").notNull().default(true),
    username: text("username").notNull().default(""),
    fromAddress: text("from_address").notNull().default(""),
    passwordEncrypted: text("password_encrypted"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

/* ------------------------------------------------------------------ */
/* Workflow engine (organization-scoped)                               */
/* ------------------------------------------------------------------ */

export const workflows = pgTable(
  "workflows",
  {
    // Workflow ids are only unique per organization (the built-in
    // "network-fault-notification" workflow exists once per org), so the
    // primary key is the (id, organization_id) pair.
    id: text("id").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    triggerEvent: text("trigger_event").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id, table.organizationId] }),
    orgIdx: index("workflows_org_idx").on(table.organizationId),
  }),
);

export const workflowNodes = pgTable(
  "workflow_nodes",
  {
    id: text("id").notNull(),
    workflowId: text("workflow_id").notNull(),
    organizationId: text("organization_id").notNull(),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    icon: text("icon").notNull().default("zap"),
    capability: text("capability"),
    config: jsonb("config"),
    position: integer("position").notNull().default(0),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id, table.workflowId, table.organizationId] }),
    workflowFk: foreignKey({
      name: "workflow_nodes_workflow_fk",
      columns: [table.workflowId, table.organizationId],
      foreignColumns: [workflows.id, workflows.organizationId],
    }).onDelete("cascade"),
    workflowIdx: index("workflow_nodes_workflow_idx").on(table.workflowId, table.organizationId),
  }),
);

export const workflowExecutions = pgTable(
  "workflow_executions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workflowId: text("workflow_id").notNull(),
    status: text("status").notNull(),
    input: jsonb("input").notNull().default({}),
    output: jsonb("output"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => ({
    workflowFk: foreignKey({
      name: "workflow_executions_workflow_fk",
      columns: [table.workflowId, table.organizationId],
      foreignColumns: [workflows.id, workflows.organizationId],
    }).onDelete("cascade"),
    workflowIdx: index("workflow_executions_workflow_idx").on(table.workflowId),
    orgTimeIdx: index("workflow_executions_org_time_idx").on(table.organizationId, table.startedAt),
  }),
);

export const events = pgTable(
  "events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    source: text("source").notNull(),
    payload: jsonb("payload").notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    typeIdx: index("events_type_idx").on(table.type),
    orgTimeIdx: index("events_org_time_idx").on(table.organizationId, table.occurredAt),
  }),
);

/* ------------------------------------------------------------------ */
/* Relations                                                           */
/* ------------------------------------------------------------------ */

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(organizationMembers),
  sessions: many(sessions),
  ownedOrganizations: many(organizations),
}));

export const organizationsRelations = relations(organizations, ({ one, many }) => ({
  owner: one(users, { fields: [organizations.ownerId], references: [users.id] }),
  members: many(organizationMembers),
  devices: many(networkDevices),
  workflows: many(workflows),
  settings: one(monitoringSettings, { fields: [organizations.id], references: [monitoringSettings.organizationId] }),
}));

export const organizationMembersRelations = relations(organizationMembers, ({ one }) => ({
  organization: one(organizations, { fields: [organizationMembers.organizationId], references: [organizations.id] }),
  user: one(users, { fields: [organizationMembers.userId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const networkDevicesRelations = relations(networkDevices, ({ one, many }) => ({
  organization: one(organizations, { fields: [networkDevices.organizationId], references: [organizations.id] }),
  checks: many(monitoringChecks),
  alerts: many(monitoringAlerts),
}));

export const monitoringChecksRelations = relations(monitoringChecks, ({ one }) => ({
  device: one(networkDevices, { fields: [monitoringChecks.deviceId], references: [networkDevices.id] }),
  organization: one(organizations, { fields: [monitoringChecks.organizationId], references: [organizations.id] }),
}));

export const monitoringAlertsRelations = relations(monitoringAlerts, ({ one }) => ({
  device: one(networkDevices, { fields: [monitoringAlerts.deviceId], references: [networkDevices.id] }),
  organization: one(organizations, { fields: [monitoringAlerts.organizationId], references: [organizations.id] }),
}));

export const workflowsRelations = relations(workflows, ({ one, many }) => ({
  organization: one(organizations, { fields: [workflows.organizationId], references: [organizations.id] }),
  nodes: many(workflowNodes),
  executions: many(workflowExecutions),
}));

export const workflowNodesRelations = relations(workflowNodes, ({ one }) => ({
  workflow: one(workflows, { fields: [workflowNodes.workflowId, workflowNodes.organizationId], references: [workflows.id, workflows.organizationId] }),
}));

export const workflowExecutionsRelations = relations(workflowExecutions, ({ one }) => ({
  workflow: one(workflows, { fields: [workflowExecutions.workflowId, workflowExecutions.organizationId], references: [workflows.id, workflows.organizationId] }),
  organization: one(organizations, { fields: [workflowExecutions.organizationId], references: [organizations.id] }),
}));

export const eventsRelations = relations(events, ({ one }) => ({
  organization: one(organizations, { fields: [events.organizationId], references: [organizations.id] }),
}));
