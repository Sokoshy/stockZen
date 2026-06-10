import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "~/lib/env";
import type { TenantRole } from "~/schemas/team-membership";

const SELF_REMOVE_CONFIRMATION_TTL_SECONDS = 300; // 5 minutes

export type RoleChangePolicyInput = {
  actorUserId: string;
  targetUserId: string;
  currentRole: TenantRole;
  nextRole: TenantRole;
  adminCount: number;
};

export type RemovePolicyInput = {
  actorUserId: string;
  targetUserId: string;
  targetRole: TenantRole;
  adminCount: number;
};

export type PolicyResult =
  | { allowed: true }
  | { allowed: false; reason: string };

const rolePriority: Record<TenantRole, number> = {
  Admin: 3,
  Manager: 2,
  Operator: 1,
};

export function canViewPurchasePrice(role: TenantRole): boolean {
  return rolePriority[role] >= rolePriority["Manager"];
}

export function canWritePurchasePrice(role: TenantRole): boolean {
  return rolePriority[role] >= rolePriority["Manager"];
}

export function isAdminRole(role: TenantRole): boolean {
  return role === "Admin";
}

export function canManageTenantMembers(role: TenantRole): boolean {
  return isAdminRole(role);
}

export function validateRoleChangePolicy(input: RoleChangePolicyInput): PolicyResult {
  const { actorUserId, targetUserId, currentRole, nextRole, adminCount } = input;

  const isSelf = actorUserId === targetUserId;
  const isSelfDemotionFromAdmin = isSelf && currentRole === "Admin" && nextRole !== "Admin";
  const wouldRemoveLastAdmin = currentRole === "Admin" && nextRole !== "Admin" && adminCount <= 1;

  if (isSelfDemotionFromAdmin && wouldRemoveLastAdmin) {
    return {
      allowed: false,
      reason: "Last Admin cannot change role away from Admin.",
    };
  }

  if (wouldRemoveLastAdmin) {
    return {
      allowed: false,
      reason: "Tenant must always retain at least one Admin.",
    };
  }

  return { allowed: true };
}

export function validateMemberRemovalPolicy(input: RemovePolicyInput): PolicyResult {
  const { actorUserId, targetUserId, targetRole, adminCount } = input;

  const isSelf = actorUserId === targetUserId;
  const removingLastAdmin = targetRole === "Admin" && adminCount <= 1;

  if (isSelf && removingLastAdmin) {
    return {
      allowed: false,
      reason: "Last Admin cannot remove their own membership.",
    };
  }

  if (removingLastAdmin) {
    return {
      allowed: false,
      reason: "Tenant must always retain at least one Admin.",
    };
  }

  return { allowed: true };
}

export function requiresSessionInvalidationForRoleChange(
  currentRole: TenantRole,
  nextRole: TenantRole
): boolean {
  if (currentRole === nextRole) {
    return false;
  }

  return currentRole === "Admin" && rolePriority[nextRole] < rolePriority[currentRole];
}

type SelfRemovalTokenPayload = {
  tenantId: string;
  userId: string;
  expiresAt: number;
};

function encodePayload(payload: SelfRemovalTokenPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodePayload(payload: string): SelfRemovalTokenPayload | null {
  try {
    const json = Buffer.from(payload, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as Partial<SelfRemovalTokenPayload>;
    if (
      typeof parsed.tenantId !== "string" ||
      typeof parsed.userId !== "string" ||
      typeof parsed.expiresAt !== "number"
    ) {
      return null;
    }

    return {
      tenantId: parsed.tenantId,
      userId: parsed.userId,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

function signPayload(payloadBase64: string): string {
  return createHmac("sha256", env.BETTER_AUTH_SECRET).update(payloadBase64).digest("base64url");
}

export function createSelfRemovalConfirmToken(input: { tenantId: string; userId: string }): string {
  const payload: SelfRemovalTokenPayload = {
    tenantId: input.tenantId,
    userId: input.userId,
    expiresAt: Date.now() + SELF_REMOVE_CONFIRMATION_TTL_SECONDS * 1000,
  };

  const payloadBase64 = encodePayload(payload);
  const signature = signPayload(payloadBase64);
  return `${payloadBase64}.${signature}`;
}

export function verifySelfRemovalConfirmToken(input: {
  token: string;
  tenantId: string;
  userId: string;
}): boolean {
  const [payloadBase64, signature] = input.token.split(".");

  if (!payloadBase64 || !signature) {
    return false;
  }

  const expectedSignature = signPayload(payloadBase64);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  if (!timingSafeEqual(actualBuffer, expectedBuffer)) {
    return false;
  }

  const payload = decodePayload(payloadBase64);
  if (!payload) {
    return false;
  }

  if (payload.expiresAt < Date.now()) {
    return false;
  }

  return payload.tenantId === input.tenantId && payload.userId === input.userId;
}
