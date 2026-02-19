import Link from "next/link";
import { redirect } from "next/navigation";

import { AuditEventsTable } from "~/features/auth/components/audit-events-table";
import { InviteUserForm } from "~/features/auth/components/invite-user-form";
import { PendingInvitationsTable } from "~/features/auth/components/pending-invitations-table";
import { TeamMembersTable } from "~/features/auth/components/team-members-table";
import { api } from "~/trpc/server";
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

  // Fetch initial data for role check
  const membersData = await api.auth.listTenantMembers();
  const canManage = membersData.actorRole === "Admin";

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

        {canManage ? (
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Invite Team Member</h2>
            <InviteUserForm />
          </div>
        ) : null}

        {canManage ? (
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Pending Invitations</h2>
            <PendingInvitationsTable canManage={canManage} />
          </div>
        ) : null}

        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Team Members</h2>
          <TeamMembersTable />
        </div>

        {canManage ? (
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Audit Logs</h2>
            <p className="mb-4 text-sm text-gray-600">
              View security-relevant actions performed in your tenant.
            </p>
            <AuditEventsTable canView={canManage} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
