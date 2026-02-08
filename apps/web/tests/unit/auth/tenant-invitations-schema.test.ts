import { describe, expect, it } from "vitest";

import {
  acceptInvitationInputSchema,
  createInvitationInputSchema,
  previewInvitationInputSchema,
  revokeInvitationInputSchema,
} from "~/schemas/tenant-invitations";

describe("Tenant invitation schemas", () => {
  describe("createInvitationInputSchema", () => {
    it("should validate valid invitation creation input", () => {
      const result = createInvitationInputSchema.safeParse({
        email: "user@example.com",
        role: "Manager",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe("user@example.com");
        expect(result.data.role).toBe("Manager");
      }
    });

    it("should accept all valid roles", () => {
      const roles = ["Admin", "Manager", "Operator"] as const;

      for (const role of roles) {
        const result = createInvitationInputSchema.safeParse({
          email: "user@example.com",
          role,
        });
        expect(result.success).toBe(true);
      }
    });

    it("should reject invalid email", () => {
      const result = createInvitationInputSchema.safeParse({
        email: "not-an-email",
        role: "Manager",
      });

      expect(result.success).toBe(false);
    });

    it("should reject empty email", () => {
      const result = createInvitationInputSchema.safeParse({
        email: "",
        role: "Manager",
      });

      expect(result.success).toBe(false);
    });

    it("should reject invalid role", () => {
      const result = createInvitationInputSchema.safeParse({
        email: "user@example.com",
        role: "InvalidRole",
      });

      expect(result.success).toBe(false);
    });

    it("should reject email exceeding max length", () => {
      const longEmail = "a".repeat(250) + "@example.com";
      const result = createInvitationInputSchema.safeParse({
        email: longEmail,
        role: "Manager",
      });

      expect(result.success).toBe(false);
    });
  });

  describe("revokeInvitationInputSchema", () => {
    it("should validate valid revocation input", () => {
      const result = revokeInvitationInputSchema.safeParse({
        invitationId: "550e8400-e29b-41d4-a716-446655440000",
      });

      expect(result.success).toBe(true);
    });

    it("should reject empty invitation ID", () => {
      const result = revokeInvitationInputSchema.safeParse({
        invitationId: "",
      });

      expect(result.success).toBe(false);
    });
  });

  describe("previewInvitationInputSchema", () => {
    it("should validate valid preview input", () => {
      const result = previewInvitationInputSchema.safeParse({
        token: "valid-token-string",
      });

      expect(result.success).toBe(true);
    });

    it("should reject empty token", () => {
      const result = previewInvitationInputSchema.safeParse({
        token: "",
      });

      expect(result.success).toBe(false);
    });
  });

  describe("acceptInvitationInputSchema", () => {
    it("should validate valid acceptance input", () => {
      const result = acceptInvitationInputSchema.safeParse({
        token: "valid-token",
        password: "Password123",
        confirmPassword: "Password123",
      });

      expect(result.success).toBe(true);
    });

    it("should reject when passwords do not match", () => {
      const result = acceptInvitationInputSchema.safeParse({
        token: "valid-token",
        password: "Password123",
        confirmPassword: "DifferentPassword",
      });

      expect(result.success).toBe(false);
    });

    it("should reject password without uppercase", () => {
      const result = acceptInvitationInputSchema.safeParse({
        token: "valid-token",
        password: "password123",
        confirmPassword: "password123",
      });

      expect(result.success).toBe(false);
    });

    it("should reject password without lowercase", () => {
      const result = acceptInvitationInputSchema.safeParse({
        token: "valid-token",
        password: "PASSWORD123",
        confirmPassword: "PASSWORD123",
      });

      expect(result.success).toBe(false);
    });

    it("should reject password without number", () => {
      const result = acceptInvitationInputSchema.safeParse({
        token: "valid-token",
        password: "PasswordABC",
        confirmPassword: "PasswordABC",
      });

      expect(result.success).toBe(false);
    });

    it("should reject short password", () => {
      const result = acceptInvitationInputSchema.safeParse({
        token: "valid-token",
        password: "Pass1",
        confirmPassword: "Pass1",
      });

      expect(result.success).toBe(false);
    });

    it("should reject empty token", () => {
      const result = acceptInvitationInputSchema.safeParse({
        token: "",
        password: "Password123",
        confirmPassword: "Password123",
      });

      expect(result.success).toBe(false);
    });

    it("should reject empty password", () => {
      const result = acceptInvitationInputSchema.safeParse({
        token: "valid-token",
        password: "",
        confirmPassword: "",
      });

      expect(result.success).toBe(false);
    });

    it("should reject long password", () => {
      const longPassword = "A1" + "a".repeat(127);
      const result = acceptInvitationInputSchema.safeParse({
        token: "valid-token",
        password: longPassword,
        confirmPassword: longPassword,
      });

      expect(result.success).toBe(false);
    });
  });
});
