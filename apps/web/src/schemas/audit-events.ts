import { z } from "zod";

export const auditActionTypeSchema = z.enum([
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

export const auditStatusSchema = z.enum(["success", "failure"]);

export const listAuditEventsInputSchema = z.object({
  cursor: z
    .object({
      createdAt: z.string().datetime(),
      id: z.string().uuid(),
    })
    .optional(),
  limit: z.number().min(1).max(100).default(20),
});

export type ListAuditEventsInput = z.infer<typeof listAuditEventsInputSchema>;

export const auditEventSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  actorUserId: z.string().nullable(),
  actionType: auditActionTypeSchema,
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  status: auditStatusSchema,
  context: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export const listAuditEventsOutputSchema = z.object({
  events: z.array(auditEventSchema),
  nextCursor: z
    .object({
      createdAt: z.string().datetime(),
      id: z.string().uuid(),
    })
    .nullable(),
});

export type ListAuditEventsOutput = z.infer<typeof listAuditEventsOutputSchema>;
