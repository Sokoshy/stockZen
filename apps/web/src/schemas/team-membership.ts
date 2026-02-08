import { z } from "zod";

export const tenantRoleSchema = z.enum(["Admin", "Manager", "Operator"]);

export type TenantRole = z.infer<typeof tenantRoleSchema>;

export const tenantMemberSchema = z.object({
  userId: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1),
  role: tenantRoleSchema,
  joinedAt: z.string().datetime({ offset: true }),
  isCurrentUser: z.boolean(),
});

export const listTenantMembersOutputSchema = z.object({
  actorRole: tenantRoleSchema,
  members: z.array(tenantMemberSchema),
});

export const updateTenantMemberRoleInputSchema = z.object({
  memberUserId: z.string().min(1, "Member user ID is required"),
  role: tenantRoleSchema,
});

export const updateTenantMemberRoleOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  memberUserId: z.string().min(1),
  role: tenantRoleSchema,
});

const removeConfirmStepSchema = z.union([z.literal(1), z.literal(2)]).default(1);

export const removeTenantMemberInputSchema = z
  .object({
    memberUserId: z.string().min(1, "Member user ID is required"),
    confirmStep: removeConfirmStepSchema,
    confirmToken: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.confirmStep === 2 && !value.confirmToken) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmToken"],
        message: "Confirmation token is required for step 2",
      });
    }
  });

export const removeTenantMemberOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  requiresSecondConfirmation: z.boolean(),
  confirmToken: z.string().optional(),
  memberUserId: z.string().min(1),
});

export type ListTenantMembersOutput = z.infer<typeof listTenantMembersOutputSchema>;
export type UpdateTenantMemberRoleInput = z.infer<typeof updateTenantMemberRoleInputSchema>;
export type UpdateTenantMemberRoleOutput = z.infer<typeof updateTenantMemberRoleOutputSchema>;
export type RemoveTenantMemberInput = z.infer<typeof removeTenantMemberInputSchema>;
export type RemoveTenantMemberOutput = z.infer<typeof removeTenantMemberOutputSchema>;
