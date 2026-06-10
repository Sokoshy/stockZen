import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import { tenantMemberships } from "~/server/db/schema";
import { hasRequiredRole } from "~/server/auth/rbac-policy";
import type { TenantRole } from "~/schemas/team-membership";
import { t } from "./trpc";

export function requireMembership(minRole?: TenantRole) {
  return t.middleware(async ({ ctx, next }) => {
    // a. Verify session
    if (!ctx.session?.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
    }
    // b. Verify tenantId
    if (!ctx.tenantId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "No tenant context" });
    }
    // c. Query membership
    const membership = await ctx.db.query.tenantMemberships.findFirst({
      columns: { role: true },
      where: and(
        eq(tenantMemberships.userId, ctx.session.user.id),
        eq(tenantMemberships.tenantId, ctx.tenantId)
      ),
    });
    // d. No membership
    if (!membership) {
      throw new TRPCError({ code: "FORBIDDEN", message: "User is not a member of this tenant" });
    }
    // e. Role check
    if (minRole && !hasRequiredRole(membership.role, minRole)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient permissions" });
    }
    // f. Return with typed membership
    return next({
      ctx: {
        ...ctx,
        session: ctx.session,
        tenantId: ctx.tenantId,
        membership: { role: membership.role } as { role: TenantRole },
      },
    });
  });
}
