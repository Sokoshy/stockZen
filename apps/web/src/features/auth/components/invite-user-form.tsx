"use client";

import { useState } from "react";

import { api } from "~/trpc/react";

const VALID_ROLES = ["Admin", "Manager", "Operator"] as const;

type InviteUserFormProps = {
  onInviteCreated: () => Promise<void>;
};

export function InviteUserForm({ onInviteCreated }: InviteUserFormProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof VALID_ROLES)[number]>("Manager");
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const createInvitation = api.auth.createInvitation.useMutation({
    onSuccess: async () => {
      setEmail("");
      setRole("Manager");
      setFormError(null);
      setSuccessMessage("Invitation sent successfully!");
      await onInviteCreated();
      setTimeout(() => setSuccessMessage(null), 5000);
    },
    onError: (error) => {
      setFormError(error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccessMessage(null);

    if (!email.trim()) {
      setFormError("Email is required");
      return;
    }

    createInvitation.mutate({ email: email.trim(), role });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {formError ? (
        <div className="rounded-md bg-red-50 p-3" role="alert">
          <p className="text-sm font-medium text-red-800">{formError}</p>
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-md bg-green-50 p-3" role="alert">
          <p className="text-sm font-medium text-green-800">{successMessage}</p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label htmlFor="invite-email" className="block text-sm font-medium text-gray-700">
            Email Address
          </label>
          <input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="colleague@example.com"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            required
          />
        </div>

        <div>
          <label htmlFor="invite-role" className="block text-sm font-medium text-gray-700">
            Role
          </label>
          <select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value as (typeof VALID_ROLES)[number])}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {VALID_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          Invited users will receive an email with a secure link to join.
          <br />
          Links expire after 7 days.
        </p>

        <button
          type="submit"
          disabled={createInvitation.isPending}
          className="inline-flex items-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
        >
          {createInvitation.isPending ? "Sending..." : "Send Invitation"}
        </button>
      </div>
    </form>
  );
}
