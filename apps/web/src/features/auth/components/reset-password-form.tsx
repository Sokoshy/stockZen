"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";

import {
  resetPasswordSchema,
  resetPasswordSubmitSchema,
  type ResetPasswordInput,
} from "~/schemas/auth";
import { api } from "~/trpc/react";

interface ResetPasswordFormProps {
  token: string;
  initialError?: string;
}

const DEFAULT_INVALID_TOKEN_MESSAGE =
  "This reset link is invalid or has expired. Please request a new reset link.";

export function ResetPasswordForm({ token, initialError }: ResetPasswordFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(initialError ?? null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      token,
      newPassword: "",
      confirmPassword: "",
    },
  });

  const resetPasswordMutation = api.auth.resetPassword.useMutation({
    onSuccess: (data) => {
      setServerError(null);
      setSuccessMessage(data.message);
      router.replace("/login");
    },
    onError: (error) => {
      setSuccessMessage(null);
      setServerError(null);

      const fieldErrors = error.data?.zodError?.fieldErrors;
      if (fieldErrors) {
        Object.entries(fieldErrors).forEach(([field, messages]) => {
          const message = messages?.[0];
          if (message) {
            setError(field as keyof ResetPasswordInput, {
              type: "server",
              message,
            });
          }
        });
        return;
      }

      setServerError(error.message || "Unable to reset password. Please try again.");
    },
  });

  const onSubmit = async (data: ResetPasswordInput) => {
    if (!token) {
      setSuccessMessage(null);
      setServerError(initialError ?? DEFAULT_INVALID_TOKEN_MESSAGE);
      return;
    }

    setServerError(null);
    setSuccessMessage(null);

    await resetPasswordMutation.mutateAsync(
      resetPasswordSubmitSchema.parse({
        token: data.token,
        newPassword: data.newPassword,
      })
    );
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      {serverError && (
        <div className="rounded-md bg-red-50 p-4" role="alert" aria-live="polite">
          <p className="text-sm font-medium text-red-800">{serverError}</p>
        </div>
      )}

      {successMessage && (
        <div className="rounded-md bg-green-50 p-4" role="status" aria-live="polite">
          <p className="text-sm font-medium text-green-800">{successMessage}</p>
        </div>
      )}

      <input {...register("token")} type="hidden" value={token} />

      <div>
        <label htmlFor="newPassword" className="block text-sm font-medium leading-6 text-gray-900">
          New Password
        </label>
        <div className="mt-2">
          <input
            {...register("newPassword")}
            id="newPassword"
            type="password"
            autoComplete="new-password"
            className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
          />
        </div>
        {errors.newPassword ? (
          <p className="mt-2 text-sm text-red-600">{errors.newPassword.message}</p>
        ) : (
          <p className="mt-2 text-xs text-gray-500">
            Must be at least 8 characters with uppercase, lowercase, and number
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="confirmPassword"
          className="block text-sm font-medium leading-6 text-gray-900"
        >
          Confirm Password
        </label>
        <div className="mt-2">
          <input
            {...register("confirmPassword")}
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
          />
        </div>
        {errors.confirmPassword && (
          <p className="mt-2 text-sm text-red-600">{errors.confirmPassword.message}</p>
        )}
      </div>

      <div>
        <button
          type="submit"
          disabled={isSubmitting || resetPasswordMutation.isPending || !token}
          className="flex w-full justify-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {resetPasswordMutation.isPending ? "Resetting password..." : "Reset password"}
        </button>
      </div>
    </form>
  );
}
