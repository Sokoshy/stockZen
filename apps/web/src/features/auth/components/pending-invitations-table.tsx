"use client";

import { api } from "~/trpc/react";

const ROLE_COLORS: Record<string, string> = {
  Admin: "bg-purple-100 text-purple-800",
  Manager: "bg-blue-100 text-blue-800",
  Operator: "bg-gray-100 text-gray-800",
};

type PendingInvitationsTableProps = {
  canManage: boolean;
  onInvitationRevoked: () => Promise<void>;
};

export function PendingInvitationsTable({
  canManage,
  onInvitationRevoked,
}: PendingInvitationsTableProps) {
  const utils = api.useUtils();
  const invitationsQuery = api.auth.listInvitations.useQuery();
  const revokeInvitation = api.auth.revokeInvitation.useMutation({
    onSuccess: async () => {
      await utils.auth.listInvitations.invalidate();
      await onInvitationRevoked();
    },
  });

  if (invitationsQuery.isLoading) {
    return <p className="text-sm text-gray-600">Loading invitations...</p>;
  }

  if (invitationsQuery.error) {
    return (
      <div className="rounded-md bg-red-50 p-4" role="alert">
        <p className="text-sm font-medium text-red-800">{invitationsQuery.error.message}</p>
      </div>
    );
  }

  const invitations = invitationsQuery.data?.invitations ?? [];

  // Filter to show only pending (not used, not revoked, not expired)
  const now = new Date();
  const pendingInvitations = invitations.filter(
    (inv) => !inv.usedAt && !inv.revokedAt && new Date(inv.expiresAt) > now
  );

  if (pendingInvitations.length === 0) {
    return (
      <p className="text-sm text-gray-600">No pending invitations.</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead>
          <tr>
            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              Email
            </th>
            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              Role
            </th>
            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              Expires
            </th>
            {canManage ? (
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                Actions
              </th>
            ) : null}
          </tr>
        </thead>

        <tbody className="divide-y divide-gray-100 bg-white">
          {pendingInvitations.map((invitation) => (
            <tr key={invitation.id}>
              <td className="px-3 py-3 text-sm text-gray-900">{invitation.email}</td>

              <td className="px-3 py-3">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    ROLE_COLORS[invitation.role] ?? "bg-gray-100 text-gray-800"
                  }`}
                >
                  {invitation.role}
                </span>
              </td>

              <td className="px-3 py-3 text-sm text-gray-700">
                {new Date(invitation.expiresAt).toLocaleDateString()}
              </td>

              {canManage ? (
                <td className="px-3 py-3">
                  <button
                    onClick={() => revokeInvitation.mutate({ invitationId: invitation.id })}
                    disabled={revokeInvitation.isPending}
                    className="text-sm font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                  >
                    {revokeInvitation.isPending ? "Revoking..." : "Revoke"}
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
