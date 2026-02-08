import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { api } from "~/trpc/server";
import { InviteAcceptanceForm } from "./invite-acceptance-form";

export const metadata: Metadata = {
  title: "Accept Invitation - StockZen",
  description: "Accept your invitation to join the team",
};

interface InvitePageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function InvitePage({ searchParams }: InvitePageProps) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <div className="mx-auto max-w-md space-y-6 text-center">
        <div className="rounded-md bg-red-50 p-4" role="alert">
          <h1 className="text-lg font-semibold text-red-800">Invalid Invitation</h1>
          <p className="mt-2 text-sm text-red-700">
            This invitation link is missing required information.
          </p>
          <p className="mt-4 text-sm text-red-600">
            Please request a new invitation from an Admin.
          </p>
        </div>
      </div>
    );
  }

  // Validate the invitation token
  const preview = await api.auth.previewInvitation({ token });

  if (!preview.valid) {
    return (
      <div className="mx-auto max-w-md space-y-6 text-center">
        <div className="rounded-md bg-red-50 p-4" role="alert">
          <h1 className="text-lg font-semibold text-red-800">
            {preview.state === "used"
              ? "Invitation Already Used"
              : preview.state === "revoked"
                ? "Invitation Revoked"
                : "Invitation Expired"}
          </h1>
          <p className="mt-2 text-sm text-red-700">{preview.message}</p>
        </div>

        <div className="text-sm text-gray-600">
          <p>
            Need help? Contact your tenant administrator for assistance or request a new invitation.
          </p>
        </div>

        <a
          href="/login"
          className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
        >
          Go to Login
        </a>
      </div>
    );
  }

  // Invitation is valid, show the acceptance form
  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Accept Invitation</h1>
        <p className="mt-2 text-sm text-gray-600">
          You have been invited to join as a <strong>{preview.role}</strong>.
        </p>
      </div>

      <div className="rounded-md bg-blue-50 p-4">
        <p className="text-sm text-blue-800">
          <strong>Email:</strong> {preview.email}
        </p>
        <p className="mt-1 text-xs text-blue-600">
          Invitation expires: {preview.expiresAt ? new Date(preview.expiresAt).toLocaleString() : "N/A"}
        </p>
      </div>

      <InviteAcceptanceForm token={token} email={preview.email ?? ""} />
    </div>
  );
}
