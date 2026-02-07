"use client";

import { useRouter } from "next/navigation";

import { api } from "~/trpc/react";

export function LogoutButton() {
  const router = useRouter();

  const logoutMutation = api.auth.logout.useMutation({
    onSuccess: () => {
      router.push("/login");
      router.refresh();
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
