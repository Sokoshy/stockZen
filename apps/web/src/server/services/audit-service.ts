import { db } from "~/server/db";
import { auditEvents, type NewAuditEvent } from "~/server/db/schema";
import { logger } from "~/server/logger";

export type AuditActionType =
  | "login"
  | "logout"
  | "password_reset_completed"
  | "invite_created"
  | "invite_revoked"
  | "role_changed"
  | "member_removed"
  | "login_failed"
  | "forbidden_attempt";

export type AuditStatus = "success" | "failure";

export interface CreateAuditEventInput {
  tenantId: string;
  actorUserId?: string | null;
  actionType: AuditActionType;
  targetType?: string;
  targetId?: string;
  status: AuditStatus;
  context?: string;
}

const SENSITIVE_KEY_PATTERN = /(password|token|secret|key|credential|authorization)/i;

function redactDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactDeep(item));
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const entries = Object.entries(record).map(([key, entryValue]) => {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        return [key, "[REDACTED]"];
      }

      return [key, redactDeep(entryValue)];
    });

    return Object.fromEntries(entries);
  }

  return value;
}

function sanitizeContext(context: string): string {
  try {
    const parsed = JSON.parse(context) as unknown;
    return JSON.stringify(redactDeep(parsed));
  } catch {
    return context.replace(/(password|token|secret|key|credential)[^,\s]*/gi, "[REDACTED]");
  }
}

export async function createAuditEvent(input: CreateAuditEventInput): Promise<void> {
  const sanitizedContext = input.context ? sanitizeContext(input.context) : undefined;

  const auditEvent: NewAuditEvent = {
    tenantId: input.tenantId,
    actorUserId: input.actorUserId ?? null,
    actionType: input.actionType,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    status: input.status,
    context: sanitizedContext ?? null,
  };

  try {
    await db.insert(auditEvents).values(auditEvent);
  } catch (error) {
    logger.warn(
      {
        event: "audit.persistence.failed",
        actionType: input.actionType,
        tenantId: input.tenantId,
        reason: error instanceof Error ? error.message : "unknown",
      },
      "Audit event persistence failed"
    );
  }
}

export async function createAuditEventWithContext(input: {
  tenantId: string;
  actorUserId?: string;
  actionType: AuditActionType;
  targetType?: string;
  targetId?: string;
  status: AuditStatus;
  extraContext?: Record<string, unknown>;
}): Promise<void> {
  const context = input.extraContext
    ? sanitizeContext(JSON.stringify(input.extraContext))
    : undefined;

  await createAuditEvent({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    actionType: input.actionType,
    targetType: input.targetType,
    targetId: input.targetId,
    status: input.status,
    context,
  });
}
