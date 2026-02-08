"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "~/trpc/react";

type InviteAcceptanceFormProps = {
  token: string;
  email: string;
};

export function InviteAcceptanceForm({ token, email }: InviteAcceptanceFormProps) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);

  const acceptInvitation = api.auth.acceptInvitation.useMutation({
    onSuccess: (data) => {
      // Redirect to login page on success
      router.push(data.redirectTo ?? "/login");
    },
    onError: (error) => {
      setGeneralError(error.message);
    },
  });

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!password) {
      errors.password = "Password is required";
    } else {
      if (password.length < 8) {
        errors.password = "Password must be at least 8 characters";
      }
      if (!/[A-Z]/.test(password)) {
        errors.password = "Password must contain at least one uppercase letter";
      }
      if (!/[a-z]/.test(password)) {
        errors.password = "Password must contain at least one lowercase letter";
      }
      if (!/[0-9]/.test(password)) {
        errors.password = "Password must contain at least one number";
      }
    }

    if (password !== confirmPassword) {
      errors.confirmPassword = "Passwords do not match";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);

    if (!validateForm()) {
      return;
    }

    acceptInvitation.mutate({
      token,
      password,
      confirmPassword,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {generalError ? (
        <div className="rounded-md bg-red-50 p-4" role="alert">
          <p className="text-sm font-medium text-red-800">{generalError}</p>
        </div>
      ) : null}

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          disabled
          className="mt-1 block w-full rounded-md border border-gray-300 bg-gray-100 px-3 py-2 text-sm text-gray-500"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={`mt-1 block w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
            formErrors.password
              ? "border-red-300 focus:border-red-500 focus:ring-red-500"
              : "border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
          }`}
          placeholder="Create a strong password"
        />
        {formErrors.password ? (
          <p className="mt-1 text-xs text-red-600">{formErrors.password}</p>
        ) : (
          <p className="mt-1 text-xs text-gray-500">
            Min 8 characters, with uppercase, lowercase, and number
          </p>
        )}
      </div>

      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
          Confirm Password
        </label>
        <input
          id="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className={`mt-1 block w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
            formErrors.confirmPassword
              ? "border-red-300 focus:border-red-500 focus:ring-red-500"
              : "border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
          }`}
          placeholder="Confirm your password"
        />
        {formErrors.confirmPassword ? (
          <p className="mt-1 text-xs text-red-600">{formErrors.confirmPassword}</p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={acceptInvitation.isPending}
        className="w-full rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
      >
        {acceptInvitation.isPending ? "Accepting Invitation..." : "Accept Invitation & Join"}
      </button>

      <p className="text-center text-xs text-gray-500">
        By accepting this invitation, you agree to join the tenant and abide by its policies.
      </p>
    </form>
  );
}
