"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  requestPasswordResetSchema,
  type RequestPasswordResetInput,
} from "~/schemas/auth";
import { api } from "~/trpc/react";

export function ForgotPasswordForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RequestPasswordResetInput>({
    resolver: zodResolver(requestPasswordResetSchema),
    defaultValues: {
      email: "",
    },
  });

  const requestPasswordResetMutation = api.auth.requestPasswordReset.useMutation({
    onSuccess: (data) => {
      setServerError(null);
      setSuccessMessage(data.message);
    },
    onError: (error) => {
      setSuccessMessage(null);
      setServerError(null);

      const fieldErrors = error.data?.zodError?.fieldErrors;
      if (fieldErrors) {
        Object.entries(fieldErrors).forEach(([field, messages]) => {
          const message = messages?.[0];
          if (message) {
            setError(field as keyof RequestPasswordResetInput, {
              type: "server",
              message,
            });
          }
        });
        return;
      }

      setServerError(error.message || "Unable to send reset link. Please try again.");
    },
  });

  const onSubmit = async (data: RequestPasswordResetInput) => {
    setServerError(null);
    setSuccessMessage(null);

    await requestPasswordResetMutation.mutateAsync(requestPasswordResetSchema.parse(data));
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

      <div>
        <label htmlFor="email" className="block text-sm font-medium leading-6 text-gray-900">
          Email address
        </label>
        <div className="mt-2">
          <input
            {...register("email")}
            id="email"
            type="email"
            autoComplete="email"
            className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
            placeholder="you@example.com"
          />
        </div>
        {errors.email && <p className="mt-2 text-sm text-red-600">{errors.email.message}</p>}
      </div>

      <div>
        <button
          type="submit"
          disabled={isSubmitting || requestPasswordResetMutation.isPending}
          className="flex w-full justify-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {requestPasswordResetMutation.isPending ? "Sending reset link..." : "Send reset link"}
        </button>
      </div>
    </form>
  );
}
