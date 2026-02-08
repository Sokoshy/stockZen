"use client";

import { useState } from "react";

import { api } from "~/trpc/react";

type RemoveMemberDialogProps = {
  memberUserId: string;
  memberName: string;
  isCurrentUser: boolean;
  canManage: boolean;
  onCompleted: () => Promise<void> | void;
};

export function RemoveMemberDialog({
  memberUserId,
  memberName,
  isCurrentUser,
  canManage,
  onCompleted,
}: RemoveMemberDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [confirmToken, setConfirmToken] = useState<string | null>(null);
  const [requiresSecondConfirmation, setRequiresSecondConfirmation] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const removeMutation = api.auth.removeTenantMember.useMutation({
    onError: (error) => {
      setErrorMessage(error.message);
    },
  });

  if (!canManage) {
    return (
      <span className="text-xs text-gray-500" aria-label="No removal access">
        Admin only
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        className="rounded-md border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
        onClick={() => {
          setErrorMessage(null);
          setRequiresSecondConfirmation(false);
          setConfirmToken(null);
          setIsOpen(true);
        }}
      >
        Remove
      </button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-gray-900">
              {isCurrentUser ? "Remove yourself from team" : "Remove team member"}
            </h3>
            <p className="mt-2 text-sm text-gray-700">
              {isCurrentUser
                ? "You are about to remove your own membership. Your access will be revoked immediately."
                : `You are about to remove ${memberName} from this tenant.`}
            </p>

            {requiresSecondConfirmation ? (
              <div className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
                This action requires a second confirmation. Click confirm again to proceed.
              </div>
            ) : null}

            {errorMessage ? <p className="mt-3 text-sm text-red-600">{errorMessage}</p> : null}

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                onClick={() => {
                  setIsOpen(false);
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                className="rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-red-300"
                disabled={removeMutation.isPending}
                onClick={async () => {
                  setErrorMessage(null);

                  const result = await removeMutation.mutateAsync({
                    memberUserId,
                    confirmStep: requiresSecondConfirmation ? 2 : 1,
                    confirmToken: requiresSecondConfirmation ? (confirmToken ?? undefined) : undefined,
                  });

                  if (result.requiresSecondConfirmation) {
                    setRequiresSecondConfirmation(true);
                    setConfirmToken(result.confirmToken ?? null);
                    return;
                  }

                  setIsOpen(false);
                  setRequiresSecondConfirmation(false);
                  setConfirmToken(null);
                  await onCompleted();
                }}
              >
                {requiresSecondConfirmation ? "Confirm removal" : "Continue"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
