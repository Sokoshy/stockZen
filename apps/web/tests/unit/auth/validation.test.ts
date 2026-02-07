import { describe, it, expect } from "vitest";
import {
  loginSchema,
  passwordSchema,
  requestPasswordResetResponseSchema,
  requestPasswordResetSchema,
  resetPasswordResponseSchema,
  resetPasswordSubmitSchema,
  resetPasswordSchema,
  signUpSchema,
} from "~/schemas/auth";

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
      expect(result.error.errors.at(0)?.message).toContain(
        "at least 8 characters"
      );
    }
  });

  it("should reject passwords without uppercase letters", () => {
    const result = passwordSchema.safeParse("password123");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors.at(0)?.message).toContain(
        "uppercase letter"
      );
    }
  });

  it("should reject passwords without lowercase letters", () => {
    const result = passwordSchema.safeParse("PASSWORD123");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors.at(0)?.message).toContain(
        "lowercase letter"
      );
    }
  });

  it("should reject passwords without numbers", () => {
    const result = passwordSchema.safeParse("PasswordABC");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors.at(0)?.message).toContain("number");
    }
  });

  it("should reject passwords that are too long", () => {
    const longPassword = "A1" + "a".repeat(130);
    const result = passwordSchema.safeParse(longPassword);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors.at(0)?.message).toContain(
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
      expect(result.error.errors.at(0)?.message).toContain("do not match");
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

describe("loginSchema", () => {
  it("should accept valid login data with rememberMe", () => {
    const result = loginSchema.safeParse({
      email: "test@example.com",
      password: "Password123",
      rememberMe: true,
    });

    expect(result.success).toBe(true);
  });

  it("should default rememberMe to false", () => {
    const result = loginSchema.safeParse({
      email: "test@example.com",
      password: "Password123",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rememberMe).toBe(false);
    }
  });

  it("should reject invalid login email", () => {
    const result = loginSchema.safeParse({
      email: "invalid-email",
      password: "Password123",
      rememberMe: false,
    });

    expect(result.success).toBe(false);
  });

  it("should require login password", () => {
    const result = loginSchema.safeParse({
      email: "test@example.com",
      password: "",
      rememberMe: false,
    });

    expect(result.success).toBe(false);
  });
});

describe("requestPasswordResetSchema", () => {
  it("should accept valid reset request email", () => {
    const result = requestPasswordResetSchema.safeParse({
      email: "test@example.com",
    });

    expect(result.success).toBe(true);
  });

  it("should reject invalid email", () => {
    const result = requestPasswordResetSchema.safeParse({
      email: "invalid-email",
    });

    expect(result.success).toBe(false);
  });

  it("should require non-empty email", () => {
    const result = requestPasswordResetSchema.safeParse({
      email: "",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors.at(0)?.message).toContain("Email is required");
    }
  });
});

describe("resetPasswordSchema", () => {
  it("should accept valid reset password payload", () => {
    const result = resetPasswordSchema.safeParse({
      token: "valid-token",
      newPassword: "NewPassword123",
      confirmPassword: "NewPassword123",
    });

    expect(result.success).toBe(true);
  });

  it("should reject when confirmation does not match", () => {
    const result = resetPasswordSchema.safeParse({
      token: "valid-token",
      newPassword: "NewPassword123",
      confirmPassword: "DifferentPassword123",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors.at(0)?.message).toContain("do not match");
    }
  });

  it("should reject weak new password using shared policy", () => {
    const result = resetPasswordSchema.safeParse({
      token: "valid-token",
      newPassword: "weak",
      confirmPassword: "weak",
    });

    expect(result.success).toBe(false);
  });

  it("should require token in reset payload", () => {
    const result = resetPasswordSchema.safeParse({
      token: "",
      newPassword: "NewPassword123",
      confirmPassword: "NewPassword123",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors.at(0)?.message).toContain("Reset token is required");
    }
  });

  it("should accept submit payload without confirm password", () => {
    const result = resetPasswordSubmitSchema.safeParse({
      token: "valid-token",
      newPassword: "NewPassword123",
    });

    expect(result.success).toBe(true);
  });

  it("should reject submit payload missing token", () => {
    const result = resetPasswordSubmitSchema.safeParse({
      token: "",
      newPassword: "NewPassword123",
    });

    expect(result.success).toBe(false);
  });
});

describe("password reset response schemas", () => {
  it("should accept valid reset request response", () => {
    const result = requestPasswordResetResponseSchema.safeParse({
      success: true,
      message: "If this email exists in our system, check your email for the reset link",
    });

    expect(result.success).toBe(true);
  });

  it("should accept valid reset submit response", () => {
    const result = resetPasswordResponseSchema.safeParse({
      success: true,
      message: "Password reset successful. Please sign in with your new password.",
    });

    expect(result.success).toBe(true);
  });

  it("should reject malformed reset responses", () => {
    const requestResult = requestPasswordResetResponseSchema.safeParse({
      success: true,
    });
    const submitResult = resetPasswordResponseSchema.safeParse({
      message: "ok",
    });

    expect(requestResult.success).toBe(false);
    expect(submitResult.success).toBe(false);
  });
});
