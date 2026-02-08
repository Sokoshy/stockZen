"use client";

import { RemoveMemberDialog } from "~/features/auth/components/remove-member-dialog";
import { TeamMemberRoleForm } from "~/features/auth/components/team-member-role-form";
import { api } from "~/trpc/react";

export function TeamMembersTable() {
  const utils = api.useUtils();
  const membersQuery = api.auth.listTenantMembers.useQuery();

  if (membersQuery.isLoading) {
    return <p className="text-sm text-gray-600">Loading team members...</p>;
  }

  if (membersQuery.error) {
    return (
      <div className="rounded-md bg-red-50 p-4" role="alert">
        <p className="text-sm font-medium text-red-800">{membersQuery.error.message}</p>
      </div>
    );
  }

  const data = membersQuery.data;
  if (!data) {
    return <p className="text-sm text-gray-600">No team data available.</p>;
  }

  const canManage = data.actorRole === "Admin";

  return (
    <div className="space-y-4">
      {!canManage ? (
        <div className="rounded-md bg-amber-50 p-4" role="alert">
          <p className="text-sm font-medium text-amber-900">
            You can view team members, but only Admins can change roles or remove members.
          </p>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead>
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                Member
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                Role
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                Joined
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                Actions
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100 bg-white">
            {data.members.map((member) => (
              <tr key={member.userId}>
                <td className="px-3 py-3 align-top">
                  <p className="text-sm font-medium text-gray-900">{member.name}</p>
                  <p className="text-sm text-gray-600">{member.email}</p>
                  {member.isCurrentUser ? (
                    <span className="mt-1 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                      You
                    </span>
                  ) : null}
                </td>

                <td className="px-3 py-3 align-top">
                  <TeamMemberRoleForm
                    memberUserId={member.userId}
                    currentRole={member.role}
                    canManage={canManage}
                    onUpdated={async () => {
                      await utils.auth.listTenantMembers.invalidate();
                    }}
                  />
                </td>

                <td className="px-3 py-3 text-sm text-gray-700 align-top">
                  {new Date(member.joinedAt).toLocaleString()}
                </td>

                <td className="px-3 py-3 align-top">
                  <RemoveMemberDialog
                    memberUserId={member.userId}
                    memberName={member.name}
                    isCurrentUser={member.isCurrentUser}
                    canManage={canManage}
                    onCompleted={async () => {
                      await utils.auth.listTenantMembers.invalidate();
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
