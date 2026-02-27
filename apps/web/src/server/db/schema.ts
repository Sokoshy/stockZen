import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  pgTableCreator,
  text,
  timestamp,
  uuid,
  varchar,
  pgEnum,
  check,
} from "drizzle-orm/pg-core";

export const createTable = pgTableCreator((name) => `pg-drizzle_${name}`);

// ============================================
// Better Auth Tables (managed by Better Auth)
// ============================================

export const user = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified")
    .$defaultFn(() => false)
    .notNull(),
  image: text("image"),
  defaultTenantId: uuid("default_tenant_id").references(() => tenants.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").$defaultFn(
    () => /* @__PURE__ */ new Date()
  ),
  updatedAt: timestamp("updated_at").$defaultFn(
    () => /* @__PURE__ */ new Date()
  ),
});

// ============================================
// Tenant Management Tables
// ============================================

export const tenantRoleEnum = pgEnum("tenant_role", [
  "Admin",
  "Manager",
  "Operator",
]);

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  defaultCriticalThreshold: integer("default_critical_threshold").notNull().default(50),
  defaultAttentionThreshold: integer("default_attention_threshold").notNull().default(100),
  createdAt: timestamp("created_at", { withTimezone: true })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .$defaultFn(() => new Date())
    .notNull(),
}, (table) => [
  check("critical_positive", sql`${table.defaultCriticalThreshold} > 0`),
  check("attention_positive", sql`${table.defaultAttentionThreshold} > 0`),
  check("critical_less_than_attention", sql`${table.defaultCriticalThreshold} < ${table.defaultAttentionThreshold}`)
]);

export const tenantMemberships = pgTable("tenant_memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  role: tenantRoleEnum("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .$defaultFn(() => new Date())
    .notNull(),
});

export const tenantInvitations = pgTable("tenant_invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 255 }).notNull(),
  role: tenantRoleEnum("role").notNull(),
  tokenHash: varchar("token_hash", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  usedAt: timestamp("used_at", { withTimezone: true }),
  invitedByUserId: text("invited_by_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .$defaultFn(() => new Date())
    .notNull(),
}, (table) => [
  index("idx_invitations_tenant_id").on(table.tenantId),
  index("idx_invitations_token_hash").on(table.tokenHash),
  index("idx_invitations_tenant_email").on(table.tenantId, table.email),
  index("idx_invitations_email").on(table.email),
]);

// ============================================
// Audit Events Table
// ============================================

export const auditActionTypeEnum = pgEnum("audit_action_type", [
  "login",
  "logout",
  "password_reset_completed",
  "invite_created",
  "invite_revoked",
  "role_changed",
  "member_removed",
  "login_failed",
  "forbidden_attempt",
]);

export const auditStatusEnum = pgEnum("audit_status", [
  "success",
  "failure",
]);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id"),
    actionType: auditActionTypeEnum("action_type").notNull(),
    targetType: varchar("target_type", { length: 100 }),
    targetId: text("target_id"),
    status: auditStatusEnum("status").notNull(),
    context: text("context"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_audit_events_tenant_created").on(table.tenantId, table.createdAt),
    index("idx_audit_events_tenant_action").on(table.tenantId, table.actionType),
  ]
);

// ============================================
// Product Management Tables
// ============================================

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    sku: varchar("sku", { length: 100 }),
    category: varchar("category", { length: 100 }),
    unit: varchar("unit", { length: 50 }),
    barcode: varchar("barcode", { length: 100 }),
    price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0"),
    purchasePrice: numeric("purchase_price", { precision: 10, scale: 2 }),
    quantity: integer("quantity").notNull().default(0),
    lowStockThreshold: integer("low_stock_threshold"),
    customCriticalThreshold: integer("custom_critical_threshold"),
    customAttentionThreshold: integer("custom_attention_threshold"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_products_tenant_id").on(table.tenantId),
    index("idx_products_tenant_name").on(table.tenantId, table.name),
    index("idx_products_sku").on(table.sku),
    index("idx_products_tenant_category").on(table.tenantId, table.category),
    index("idx_products_barcode").on(table.barcode),
    check("product_custom_critical_positive", sql`${table.customCriticalThreshold} IS NULL OR ${table.customCriticalThreshold} > 0`),
    check("product_custom_attention_positive", sql`${table.customAttentionThreshold} IS NULL OR ${table.customAttentionThreshold} > 0`),
    check(
      "product_custom_critical_less_than_attention",
      sql`(
        (${table.customCriticalThreshold} IS NULL AND ${table.customAttentionThreshold} IS NULL)
        OR
        (${table.customCriticalThreshold} IS NOT NULL AND ${table.customAttentionThreshold} IS NOT NULL AND ${table.customCriticalThreshold} < ${table.customAttentionThreshold})
      )`
    ),
  ]
);

// ============================================
// Stock Movements Table
// ============================================

export const movementTypeEnum = pgEnum("movement_type", ["entry", "exit"]);

// ============================================
// Alerts Table
// ============================================

export const alertLevelEnum = pgEnum("alert_level", ["red", "orange", "green"]);
export const alertStatusEnum = pgEnum("alert_status", ["active", "closed"]);

export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    level: alertLevelEnum("level").notNull(),
    status: alertStatusEnum("status").notNull().default("active"),
    stockAtCreation: integer("stock_at_creation").notNull(),
    currentStock: integer("current_stock").notNull(),
    handledAt: timestamp("handled_at", { withTimezone: true }),
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_alerts_tenant_status_level").on(
      table.tenantId,
      table.status,
      table.level
    ),
    index("idx_alerts_tenant_updated").on(table.tenantId, table.updatedAt),
    index("idx_alerts_product_id").on(table.productId),
  ]
);

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: movementTypeEnum("type").notNull(),
    quantity: integer("quantity").notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_stock_movements_tenant_id").on(table.tenantId),
    index("idx_stock_movements_product_id").on(table.productId),
    index("idx_stock_movements_tenant_product").on(table.tenantId, table.productId),
    index("idx_stock_movements_created_at").on(table.createdAt),
    index("idx_stock_movements_idempotency").on(table.tenantId, table.idempotencyKey),
  ]
);

// ============================================
// Example/Demo Table (can be removed later)
// ============================================

export const posts = createTable(
  "post",
  (d) => ({
    id: d.integer().primaryKey().generatedByDefaultAsIdentity(),
    name: d.varchar({ length: 256 }),
    createdById: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [
    index("created_by_idx").on(t.createdById),
    index("name_idx").on(t.name),
  ]
);

// ============================================
// Relations
// ============================================

export const userRelations = relations(user, ({ many }) => ({
  account: many(account),
  session: many(session),
  memberships: many(tenantMemberships),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const tenantsRelations = relations(tenants, ({ many }) => ({
  memberships: many(tenantMemberships),
}));

export const tenantMembershipsRelations = relations(
  tenantMemberships,
  ({ one }) => ({
    tenant: one(tenants, {
      fields: [tenantMemberships.tenantId],
      references: [tenants.id],
    }),
    user: one(user, {
      fields: [tenantMemberships.userId],
      references: [user.id],
    }),
  })
);

export const tenantInvitationsRelations = relations(
  tenantInvitations,
  ({ one }) => ({
    tenant: one(tenants, {
      fields: [tenantInvitations.tenantId],
      references: [tenants.id],
    }),
    invitedBy: one(user, {
      fields: [tenantInvitations.invitedByUserId],
      references: [user.id],
    }),
  })
);

export const auditEventsRelations = relations(auditEvents, ({ one }) => ({
  tenant: one(tenants, {
    fields: [auditEvents.tenantId],
    references: [tenants.id],
  }),
  actor: one(user, {
    fields: [auditEvents.actorUserId],
    references: [user.id],
  }),
}));

export const productsRelations = relations(products, ({ one }) => ({
  tenant: one(tenants, {
    fields: [products.tenantId],
    references: [tenants.id],
  }),
}));

export const stockMovementsRelations = relations(stockMovements, ({ one }) => ({
  tenant: one(tenants, {
    fields: [stockMovements.tenantId],
    references: [tenants.id],
  }),
  product: one(products, {
    fields: [stockMovements.productId],
    references: [products.id],
  }),
  user: one(user, {
    fields: [stockMovements.userId],
    references: [user.id],
  }),
}));

export const alertsRelations = relations(alerts, ({ one }) => ({
  tenant: one(tenants, {
    fields: [alerts.tenantId],
    references: [tenants.id],
  }),
  product: one(products, {
    fields: [alerts.productId],
    references: [products.id],
  }),
}));

// ============================================
// Type Exports
// ============================================

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
export type TenantMembership = typeof tenantMemberships.$inferSelect;
export type NewTenantMembership = typeof tenantMemberships.$inferInsert;
export type TenantInvitation = typeof tenantInvitations.$inferSelect;
export type NewTenantInvitation = typeof tenantInvitations.$inferInsert;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type NewAuditEvent = typeof auditEvents.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type StockMovement = typeof stockMovements.$inferSelect;
export type NewStockMovement = typeof stockMovements.$inferInsert;
export type Alert = typeof alerts.$inferSelect;
export type NewAlert = typeof alerts.$inferInsert;
