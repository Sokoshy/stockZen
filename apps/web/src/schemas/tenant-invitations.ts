import { z } from "zod";
import { tenantRoleSchema } from "./team-membership";
import { passwordSchema } from "./auth";

// ============================================
// Input Schemas
// ============================================

/**
 * Create invitation input schema
 * Used by Admins to invite users to their tenant
 */
export const createInvitationInputSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Please enter a valid email address")
    .max(255, "Email must be at most 255 characters"),
  role: tenantRoleSchema,
});

export type CreateInvitationInput = z.infer<typeof createInvitationInputSchema>;

/**
 * Revoke invitation input schema
 */
export const revokeInvitationInputSchema = z.object({
  invitationId: z.string().min(1, "Invitation ID is required"),
});

export type RevokeInvitationInput = z.infer<typeof revokeInvitationInputSchema>;

/**
 * Preview/validate invitation token schema
 * Used to check invitation state before showing acceptance form
 */
export const previewInvitationInputSchema = z.object({
  token: z.string().min(1, "Invitation token is required"),
});

export type PreviewInvitationInput = z.infer<typeof previewInvitationInputSchema>;

/**
 * Accept invitation input schema
 * Used by invitee to set password and join tenant
 */
export const acceptInvitationInputSchema = z
  .object({
    token: z.string().min(1, "Invitation token is required"),
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type AcceptInvitationInput = z.infer<typeof acceptInvitationInputSchema>;

// ============================================
// Output Schemas
// ============================================

/**
 * Invitation state enum for API responses
 */
export const invitationStateSchema = z.enum([
  "pending",
  "expired",
  "revoked",
  "used",
]);

export type InvitationState = z.infer<typeof invitationStateSchema>;

/**
 * Invitation metadata schema
 */
export const invitationSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  email: z.string().email(),
  role: tenantRoleSchema,
  invitedByUserId: z.string().min(1),
  expiresAt: z.string().datetime({ offset: true }),
  revokedAt: z.string().datetime({ offset: true }).optional(),
  usedAt: z.string().datetime({ offset: true }).optional(),
  createdAt: z.string().datetime({ offset: true }),
});

export type Invitation = z.infer<typeof invitationSchema>;

/**
 * Create invitation response schema
 */
export const createInvitationResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  invitation: invitationSchema.optional(),
});

export type CreateInvitationResponse = z.infer<typeof createInvitationResponseSchema>;

/**
 * Revoke invitation response schema
 */
export const revokeInvitationResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export type RevokeInvitationResponse = z.infer<typeof revokeInvitationResponseSchema>;

/**
 * Preview invitation response schema
 * Returns non-sensitive information about the invitation state
 */
export const previewInvitationResponseSchema = z.object({
  valid: z.boolean(),
  state: invitationStateSchema,
  email: z.string().email().optional(),
  role: tenantRoleSchema.optional(),
  expiresAt: z.string().datetime({ offset: true }).optional(),
  message: z.string(),
});

export type PreviewInvitationResponse = z.infer<typeof previewInvitationResponseSchema>;

/**
 * Accept invitation response schema
 */
export const acceptInvitationResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  redirectTo: z.string().optional(),
});

export type AcceptInvitationResponse = z.infer<typeof acceptInvitationResponseSchema>;

/**
 * List invitations output schema
 */
export const listInvitationsOutputSchema = z.object({
  invitations: z.array(invitationSchema),
});

export type ListInvitationsOutput = z.infer<typeof listInvitationsOutputSchema>;
