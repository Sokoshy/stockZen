import { describe, it, expect } from "vitest";
import { signUpSchema, passwordSchema } from "~/schemas/auth";

describe("passwordSchema", () => {
  it("should accept valid passwords", () => {
    const validPasswords = [
      "Password123",
      "MySecurePass1",
      "Complex123!",
      "Abcdefg1",
    ];

    validPasswords.forEach((password) => {
      const result = passwordSchema.safeParse(password);
      expect(result.success).toBe(true);
    });
  });

  it("should reject passwords that are too short", () => {
    const result = passwordSchema.safeParse("Pass1");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toContain(
        "at least 8 characters"
      );
    }
  });

  it("should reject passwords without uppercase letters", () => {
    const result = passwordSchema.safeParse("password123");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toContain(
        "uppercase letter"
      );
    }
  });

  it("should reject passwords without lowercase letters", () => {
    const result = passwordSchema.safeParse("PASSWORD123");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toContain(
        "lowercase letter"
      );
    }
  });

  it("should reject passwords without numbers", () => {
    const result = passwordSchema.safeParse("PasswordABC");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toContain("number");
    }
  });

  it("should reject passwords that are too long", () => {
    const longPassword = "A1" + "a".repeat(130);
    const result = passwordSchema.safeParse(longPassword);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toContain(
        "at most 128 characters"
      );
    }
  });
});

describe("signUpSchema", () => {
  it("should accept valid sign-up data", () => {
    const validData = {
      email: "test@example.com",
      password: "Password123",
      confirmPassword: "Password123",
      tenantName: "Acme Inc.",
    };

    const result = signUpSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it("should reject invalid email addresses", () => {
    const invalidEmails = [
      "not-an-email",
      "@example.com",
      "test@",
      "test@.com",
    ];

    invalidEmails.forEach((email) => {
      const result = signUpSchema.safeParse({
        email,
        password: "Password123",
        confirmPassword: "Password123",
        tenantName: "Acme Inc.",
      });
      expect(result.success).toBe(false);
    });
  });

  it("should reject when passwords do not match", () => {
    const result = signUpSchema.safeParse({
      email: "test@example.com",
      password: "Password123",
      confirmPassword: "Different123",
      tenantName: "Acme Inc.",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toContain("do not match");
    }
  });

  it("should reject empty tenant name", () => {
    const result = signUpSchema.safeParse({
      email: "test@example.com",
      password: "Password123",
      confirmPassword: "Password123",
      tenantName: "",
    });

    expect(result.success).toBe(false);
  });

  it("should reject empty email", () => {
    const result = signUpSchema.safeParse({
      email: "",
      password: "Password123",
      confirmPassword: "Password123",
      tenantName: "Acme Inc.",
    });

    expect(result.success).toBe(false);
  });

  it("should reject weak passwords", () => {
    const result = signUpSchema.safeParse({
      email: "test@example.com",
      password: "weak",
      confirmPassword: "weak",
      tenantName: "Acme Inc.",
    });

    expect(result.success).toBe(false);
  });
});
