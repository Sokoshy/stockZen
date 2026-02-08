// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";
import { tenantInvitations, tenantMemberships, user } from "~/server/db/schema";
import {
  cleanDatabase,
  createTestDb,
  generateTestEmail,
  generateTestTenantName,
} from "../helpers/database";

let ipSequence = 100;
let tokenSequence = 0;

function nextIp(): string {
  ipSequence += 1;
  return `127.0.30.${ipSequence}`;
}

function nextInvitationToken(): string {
  tokenSequence += 1;
  return `invite-token-${tokenSequence}-${Date.now()}`;
}

async function createProtectedCaller(cookie: string, clientIp: string) {
  const headers = new Headers({
    cookie,
    "x-forwarded-for": clientIp,
    host: "localhost:3000",
    "x-forwarded-host": "localhost:3000",
    "x-forwarded-proto": "http",
  });

  const ctx = await createTRPCContext({ headers });
  return {
    ctx,
    caller: createCaller(ctx),
  };
}

async function ensureInvitationSchema(db: ReturnType<typeof createTestDb>) {
  const client = await db.$client;

  await client`SET client_min_messages = warning`;

  await client`
    CREATE TABLE IF NOT EXISTS "tenant_invitations" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
      "email" varchar(255) NOT NULL,
      "role" "tenant_role" NOT NULL,
      "token_hash" varchar(255) NOT NULL UNIQUE,
      "expires_at" timestamp with time zone NOT NULL,
      "revoked_at" timestamp with time zone,
      "used_at" timestamp with time zone,
      "invited_by_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    )
  `;

  await client`
    CREATE INDEX IF NOT EXISTS "idx_invitations_tenant_id" ON "tenant_invitations"("tenant_id")
  `;
  await client`
    CREATE INDEX IF NOT EXISTS "idx_invitations_token_hash" ON "tenant_invitations"("token_hash")
  `;
  await client`
    CREATE INDEX IF NOT EXISTS "idx_invitations_tenant_email" ON "tenant_invitations"("tenant_id", "email")
  `;
  await client`
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_invitations_tenant_email_pending"
    ON "tenant_invitations"("tenant_id", lower("email"))
    WHERE "revoked_at" IS NULL AND "used_at" IS NULL
  `;

  await client`ALTER TABLE "tenant_invitations" ENABLE ROW LEVEL SECURITY`;

  await client`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenant_invitations' AND policyname = 'invitation_isolation_select'
      ) THEN
        CREATE POLICY "invitation_isolation_select" ON "tenant_invitations"
          FOR SELECT USING (
            tenant_id = current_setting('app.tenant_id', true)::uuid
            OR token_hash = current_setting('app.invitation_token_hash', true)
          );
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenant_invitations' AND policyname = 'invitation_isolation_insert'
      ) THEN
        CREATE POLICY "invitation_isolation_insert" ON "tenant_invitations"
          FOR INSERT WITH CHECK (
            tenant_id = current_setting('app.tenant_id', true)::uuid
          );
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenant_invitations' AND policyname = 'invitation_isolation_update'
      ) THEN
        CREATE POLICY "invitation_isolation_update" ON "tenant_invitations"
          FOR UPDATE USING (
            tenant_id = current_setting('app.tenant_id', true)::uuid
            OR token_hash = current_setting('app.invitation_token_hash', true)
          )
          WITH CHECK (
            tenant_id = current_setting('app.tenant_id', true)::uuid
            OR token_hash = current_setting('app.invitation_token_hash', true)
          );
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenant_invitations' AND policyname = 'invitation_isolation_delete'
      ) THEN
        CREATE POLICY "invitation_isolation_delete" ON "tenant_invitations"
          FOR DELETE USING (
            tenant_id = current_setting('app.tenant_id', true)::uuid
          );
      END IF;
    END
    $$
  `;
}

describe("Auth invitations", () => {
  const testDb = createTestDb();

  beforeEach(async () => {
    await ensureInvitationSchema(testDb);
    await cleanDatabase(testDb);
    ipSequence += 20;
    tokenSequence = 0;
    vi.restoreAllMocks();
  });

  async function signUpUser(role: "Admin" | "Manager" | "Operator" = "Admin") {
    const email = generateTestEmail();
    const password = "Password123";
    const tenantName = generateTestTenantName();

    const signUpCtx = await createTRPCContext({
      headers: new Headers({ "x-forwarded-for": nextIp() }),
    });
    const signUpCaller = createCaller(signUpCtx);

    const signUpResult = await signUpCaller.auth.signUp({
      email,
      password,
      confirmPassword: password,
      tenantName,
    });

    if (!signUpResult.user?.id || !signUpResult.tenant?.id) {
      throw new Error("Expected sign-up to return user and tenant IDs");
    }

    const loginCtx = await createTRPCContext({
      headers: new Headers({ "x-forwarded-for": nextIp() }),
    });
    const loginCaller = createCaller(loginCtx);

    await loginCaller.auth.login({
      email,
      password,
      rememberMe: false,
    });

    const setCookie = loginCtx.responseHeaders.get("set-cookie");
    if (!setCookie) {
      throw new Error("Expected login response to include session cookie");
    }

    const cookie = setCookie.split(";")[0] ?? "";

    if (role !== "Admin") {
      await testDb
        .update(tenantMemberships)
        .set({ role })
        .where(
          and(
            eq(tenantMemberships.tenantId, signUpResult.tenant.id),
            eq(tenantMemberships.userId, signUpResult.user.id)
          )
        );
    }

    return {
      userId: signUpResult.user.id,
      tenantId: signUpResult.tenant.id,
      email,
      password,
      tenantName,
      cookie,
    };
  }

  async function createInvitationWithKnownToken(
    caller: Awaited<ReturnType<typeof createProtectedCaller>>["caller"],
    input: { email: string; role: "Admin" | "Manager" | "Operator" }
  ) {
    const token = nextInvitationToken();
    const randomUuidSpy = vi
      .spyOn(globalThis.crypto, "randomUUID")
      .mockReturnValueOnce(token);

    try {
      const result = await caller.auth.createInvitation(input);
      return { result, token };
    } finally {
      randomUuidSpy.mockRestore();
    }
  }

  describe("Admin invitation management", () => {
    it("allows Admin to create invitation", async () => {
      const admin = await signUpUser("Admin");
      const { caller } = await createProtectedCaller(admin.cookie, nextIp());

      const invitedEmail = generateTestEmail();
      const { result } = await createInvitationWithKnownToken(caller, {
        email: invitedEmail,
        role: "Manager",
      });

      expect(result.success).toBe(true);
      expect(result.invitation).toBeDefined();
      expect(result.invitation?.email).toBe(invitedEmail.toLowerCase());
      expect(result.invitation?.role).toBe("Manager");
      expect(result.invitation?.tenantId).toBe(admin.tenantId);
      expect(result.invitation?.expiresAt).toBeTruthy();
    });

    it("allows Admin to revoke pending invitation", async () => {
      const admin = await signUpUser("Admin");
      const { caller } = await createProtectedCaller(admin.cookie, nextIp());

      const invitedEmail = generateTestEmail();
      const { result } = await createInvitationWithKnownToken(caller, {
        email: invitedEmail,
        role: "Manager",
      });

      const revokeResult = await caller.auth.revokeInvitation({
        invitationId: result.invitation!.id,
      });

      expect(revokeResult.success).toBe(true);

      const invitation = await testDb.query.tenantInvitations.findFirst({
        where: eq(tenantInvitations.id, result.invitation!.id),
      });

      expect(invitation?.revokedAt).toBeDefined();
    });

    it("allows Admin to list invitations", async () => {
      const admin = await signUpUser("Admin");
      const { caller } = await createProtectedCaller(admin.cookie, nextIp());

      const invitedEmail = generateTestEmail();
      await createInvitationWithKnownToken(caller, {
        email: invitedEmail,
        role: "Manager",
      });

      const listResult = await caller.auth.listInvitations();

      expect(listResult.invitations).toHaveLength(1);
      expect(listResult.invitations[0]?.email).toBe(invitedEmail.toLowerCase());
    });

    it("prevents duplicate pending invitation for same email", async () => {
      const admin = await signUpUser("Admin");
      const { caller } = await createProtectedCaller(admin.cookie, nextIp());

      const invitedEmail = generateTestEmail();
      await createInvitationWithKnownToken(caller, {
        email: invitedEmail,
        role: "Manager",
      });

      await expect(
        createInvitationWithKnownToken(caller, {
          email: invitedEmail,
          role: "Operator",
        })
      ).rejects.toThrow(/already exists/i);
    });

    it("prevents inviting existing tenant member (case-insensitive)", async () => {
      const admin = await signUpUser("Admin");
      const { caller } = await createProtectedCaller(admin.cookie, nextIp());

      await expect(
        createInvitationWithKnownToken(caller, {
          email: admin.email.toUpperCase(),
          role: "Manager",
        })
      ).rejects.toThrow(/already a member/i);
    });
  });

  describe("Authorization - Manager/Operator forbidden", () => {
    it("forbids Manager from creating invitation", async () => {
      const manager = await signUpUser("Manager");
      const { caller } = await createProtectedCaller(manager.cookie, nextIp());

      await expect(
        createInvitationWithKnownToken(caller, {
          email: generateTestEmail(),
          role: "Operator",
        })
      ).rejects.toThrow(/Only Admins can create invitations/i);
    });

    it("forbids Manager from revoking invitation", async () => {
      const admin = await signUpUser("Admin");
      const adminCaller = (await createProtectedCaller(admin.cookie, nextIp())).caller;

      const invitedEmail = generateTestEmail();
      const { result } = await createInvitationWithKnownToken(adminCaller, {
        email: invitedEmail,
        role: "Manager",
      });

      const manager = await signUpUser("Manager");
      const managerCaller = (await createProtectedCaller(manager.cookie, nextIp())).caller;

      await expect(
        managerCaller.auth.revokeInvitation({
          invitationId: result.invitation!.id,
        })
      ).rejects.toThrow(/Only Admins can revoke invitations/i);
    });

    it("forbids Manager from listing invitations", async () => {
      const manager = await signUpUser("Manager");
      const { caller } = await createProtectedCaller(manager.cookie, nextIp());

      await expect(caller.auth.listInvitations()).rejects.toThrow(
        /Only Admins can view invitations/i
      );
    });

    it("forbids Operator from creating invitation", async () => {
      const operator = await signUpUser("Operator");
      const { caller } = await createProtectedCaller(operator.cookie, nextIp());

      await expect(
        createInvitationWithKnownToken(caller, {
          email: generateTestEmail(),
          role: "Manager",
        })
      ).rejects.toThrow(/Only Admins can create invitations/i);
    });
  });

  describe("Invitation lifecycle", () => {
    it("accepts valid invitation for a new user and marks token used", async () => {
      const admin = await signUpUser("Admin");
      const { caller } = await createProtectedCaller(admin.cookie, nextIp());

      const invitedEmail = generateTestEmail();
      const { result, token } = await createInvitationWithKnownToken(caller, {
        email: invitedEmail,
        role: "Manager",
      });

      const preview = await caller.auth.previewInvitation({ token });
      expect(preview.valid).toBe(true);
      expect(preview.state).toBe("pending");

      const acceptResult = await caller.auth.acceptInvitation({
        token,
        password: "Password123",
        confirmPassword: "Password123",
      });

      expect(acceptResult.success).toBe(true);

      const invitation = await testDb.query.tenantInvitations.findFirst({
        where: eq(tenantInvitations.id, result.invitation!.id),
      });
      expect(invitation?.usedAt).toBeDefined();

      const invitedUser = await testDb.query.user.findFirst({
        where: eq(user.email, invitedEmail.toLowerCase()),
      });
      expect(invitedUser).toBeDefined();

      const membership = await testDb.query.tenantMemberships.findFirst({
        where: and(
          eq(tenantMemberships.tenantId, admin.tenantId),
          eq(tenantMemberships.userId, invitedUser!.id)
        ),
      });

      expect(membership?.role).toBe("Manager");
    });

    it("prevents invitation token replay after first accept", async () => {
      const admin = await signUpUser("Admin");
      const { caller } = await createProtectedCaller(admin.cookie, nextIp());

      const invitedEmail = generateTestEmail();
      const { token } = await createInvitationWithKnownToken(caller, {
        email: invitedEmail,
        role: "Operator",
      });

      await caller.auth.acceptInvitation({
        token,
        password: "Password123",
        confirmPassword: "Password123",
      });

      await expect(
        caller.auth.acceptInvitation({
          token,
          password: "Password123",
          confirmPassword: "Password123",
        })
      ).rejects.toThrow(/already been used/i);
    });

    it("rejects expired invitation token", async () => {
      const admin = await signUpUser("Admin");
      const { caller } = await createProtectedCaller(admin.cookie, nextIp());

      const invitedEmail = generateTestEmail();
      const { result, token } = await createInvitationWithKnownToken(caller, {
        email: invitedEmail,
        role: "Manager",
      });

      await testDb
        .update(tenantInvitations)
        .set({ expiresAt: new Date(Date.now() - 1_000) })
        .where(eq(tenantInvitations.id, result.invitation!.id));

      const preview = await caller.auth.previewInvitation({ token });
      expect(preview.valid).toBe(false);
      expect(preview.state).toBe("expired");

      await expect(
        caller.auth.acceptInvitation({
          token,
          password: "Password123",
          confirmPassword: "Password123",
        })
      ).rejects.toThrow(/expired/i);
    });

    it("rejects revoked invitation token", async () => {
      const admin = await signUpUser("Admin");
      const { caller } = await createProtectedCaller(admin.cookie, nextIp());

      const invitedEmail = generateTestEmail();
      const { result, token } = await createInvitationWithKnownToken(caller, {
        email: invitedEmail,
        role: "Manager",
      });

      await caller.auth.revokeInvitation({
        invitationId: result.invitation!.id,
      });

      const preview = await caller.auth.previewInvitation({ token });
      expect(preview.valid).toBe(false);
      expect(preview.state).toBe("revoked");

      await expect(
        caller.auth.acceptInvitation({
          token,
          password: "Password123",
          confirmPassword: "Password123",
        })
      ).rejects.toThrow(/revoked/i);
    });

    it("adds existing user to tenant without creating duplicate account", async () => {
      const admin = await signUpUser("Admin");
      const existingUser = await signUpUser("Operator");
      const { caller } = await createProtectedCaller(admin.cookie, nextIp());

      const { token } = await createInvitationWithKnownToken(caller, {
        email: existingUser.email,
        role: "Manager",
      });

      const beforeCount = await testDb
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, existingUser.email));
      expect(beforeCount).toHaveLength(1);

      const acceptResult = await caller.auth.acceptInvitation({
        token,
        password: "Password123",
        confirmPassword: "Password123",
      });

      expect(acceptResult.success).toBe(true);

      const afterCount = await testDb
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, existingUser.email));
      expect(afterCount).toHaveLength(1);

      const membership = await testDb.query.tenantMemberships.findFirst({
        where: and(
          eq(tenantMemberships.tenantId, admin.tenantId),
          eq(tenantMemberships.userId, existingUser.userId)
        ),
      });

      expect(membership?.role).toBe("Manager");
    });
  });

  describe("Tenant isolation", () => {
    it("does not allow cross-tenant invitation management", async () => {
      const admin1 = await signUpUser("Admin");
      const admin2 = await signUpUser("Admin");

      const caller1 = (await createProtectedCaller(admin1.cookie, nextIp())).caller;
      const caller2 = (await createProtectedCaller(admin2.cookie, nextIp())).caller;

      const invitedEmail = generateTestEmail();
      const { result } = await createInvitationWithKnownToken(caller1, {
        email: invitedEmail,
        role: "Manager",
      });

      const listResult = await caller2.auth.listInvitations();
      expect(listResult.invitations).toHaveLength(0);

      await expect(
        caller2.auth.revokeInvitation({
          invitationId: result.invitation!.id,
        })
      ).rejects.toThrow(/not found/i);
    });
  });
});
