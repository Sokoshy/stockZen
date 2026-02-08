"use client";

import { useState } from "react";

import { type TenantRole } from "~/schemas/team-membership";
import { api } from "~/trpc/react";

type TeamMemberRoleFormProps = {
  memberUserId: string;
  currentRole: TenantRole;
  canManage: boolean;
  onUpdated: () => Promise<void> | void;
};

const roleOptions: TenantRole[] = ["Admin", "Manager", "Operator"];

export function TeamMemberRoleForm({
  memberUserId,
  currentRole,
  canManage,
  onUpdated,
}: TeamMemberRoleFormProps) {
  const [selectedRole, setSelectedRole] = useState<TenantRole>(currentRole);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const updateRoleMutation = api.auth.updateTenantMemberRole.useMutation({
    onSuccess: async () => {
      setErrorMessage(null);
      await onUpdated();
    },
    onError: (error) => {
      setErrorMessage(error.message);
      setSelectedRole(currentRole);
    },
  });

  const isDisabled = !canManage || updateRoleMutation.isPending;
  const isDirty = selectedRole !== currentRole;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <select
          value={selectedRole}
          onChange={(event) => {
            setErrorMessage(null);
            setSelectedRole(event.target.value as TenantRole);
          }}
          disabled={isDisabled}
          className="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100"
          aria-label="Member role"
        >
          {roleOptions.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>

        <button
          type="button"
          disabled={isDisabled || !isDirty}
          onClick={async () => {
            await updateRoleMutation.mutateAsync({
              memberUserId,
              role: selectedRole,
            });
          }}
          className="rounded-md bg-indigo-600 px-2 py-1 text-xs font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-300"
        >
          Save
        </button>
      </div>

      {errorMessage ? <p className="text-xs text-red-600">{errorMessage}</p> : null}
    </div>
  );
}
