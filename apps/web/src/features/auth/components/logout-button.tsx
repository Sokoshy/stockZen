"use client";

import { api } from "~/trpc/react";

export function LogoutButton() {
  const logoutMutation = api.auth.logout.useMutation({
    onSuccess: () => {
      window.setTimeout(() => {
        window.location.assign("/login");
      }, 50);
    },
  });

  return (
    <button
      type="button"
      onClick={() => logoutMutation.mutate()}
      disabled={logoutMutation.isPending}
      className="rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {logoutMutation.isPending ? "Signing out..." : "Sign out"}
    </button>
  );
}
