import { z } from "zod";

/**
 * Password validation schema
 * Requirements:
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 */
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number");

/**
 * Sign-up input validation schema
 * Used for both client and server validation
 */
export const signUpSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .min(1, "Email is required")
      .email("Please enter a valid email address"),
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Please confirm your password"),
    tenantName: z
      .string()
      .min(1, "Organization name is required")
      .max(255, "Organization name must be at most 255 characters"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type SignUpInput = z.infer<typeof signUpSchema>;

/**
 * Login input validation schema
 */
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Email is required")
    .email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().default(false),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type LoginFormInput = z.input<typeof loginSchema>;

/**
 * Password reset request input validation schema
 */
export const requestPasswordResetSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Email is required")
    .email("Please enter a valid email address"),
});

export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;

/**
 * Password reset input validation schema (UI/shared)
 */
const resetPasswordFieldsSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  newPassword: passwordSchema,
  confirmPassword: z.string().min(1, "Please confirm your password"),
});

export const resetPasswordSchema = resetPasswordFieldsSchema.refine(
  (data) => data.newPassword === data.confirmPassword,
  {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  }
);

export const resetPasswordSubmitSchema = resetPasswordFieldsSchema.pick({
  token: true,
  newPassword: true,
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ResetPasswordSubmitInput = z.infer<typeof resetPasswordSubmitSchema>;

/**
 * Sign-up API response schema
 */
export const signUpResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  user: z
    .object({
      id: z.string(),
      email: z.string(),
      name: z.string(),
    })
    .optional(),
  tenant: z
    .object({
      id: z.string(),
      name: z.string(),
    })
    .optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      fieldErrors: z.record(z.array(z.string())).optional(),
    })
    .optional(),
});

export type SignUpResponse = z.infer<typeof signUpResponseSchema>;

/**
 * Login API response schema
 */
export const loginResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  user: z
    .object({
      id: z.string(),
      email: z.string(),
      name: z.string(),
    })
    .optional(),
});

export type LoginResponse = z.infer<typeof loginResponseSchema>;

/**
 * Password reset request API response schema
 */
export const requestPasswordResetResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export type RequestPasswordResetResponse = z.infer<
  typeof requestPasswordResetResponseSchema
>;

/**
 * Password reset submit API response schema
 */
export const resetPasswordResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export type ResetPasswordResponse = z.infer<typeof resetPasswordResponseSchema>;
