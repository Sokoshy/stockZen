import Link from "next/link";
import { redirect } from "next/navigation";

import { TeamMembersTable } from "~/features/auth/components/team-members-table";
import { getSession } from "~/server/better-auth/server";

export const metadata = {
  title: "Team Management - StockZen",
  description: "Manage tenant members and roles",
};

export default async function TeamPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Team Management</h1>
            <p className="mt-1 text-sm text-gray-600">
              Manage roles and memberships for your current tenant.
            </p>
          </div>

          <Link
            href="/dashboard"
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-100"
          >
            Back to dashboard
          </Link>
        </div>

        <div className="rounded-lg bg-white p-6 shadow">
          <TeamMembersTable />
        </div>
      </div>
    </div>
  );
}
