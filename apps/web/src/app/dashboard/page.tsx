import { redirect } from "next/navigation";
import Link from "next/link";

import { LogoutButton } from "~/features/auth/components/logout-button";
import { getSession } from "~/server/better-auth/server";
import { TenantThresholdsForm } from "~/features/tenant-thresholds/components/tenant-thresholds-form";
import { db } from "~/server/db";
import { tenantMemberships } from "~/server/db/schema";
import { eq, and } from "drizzle-orm";

export const metadata = {
  title: "Dashboard - StockZen",
  description: "Your StockZen dashboard",
};

export default async function DashboardPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const membership = session.user.defaultTenantId
    ? await db.query.tenantMemberships.findFirst({
        where: and(
          eq(tenantMemberships.tenantId, session.user.defaultTenantId),
          eq(tenantMemberships.userId, session.user.id)
        ),
      })
    : null;

  const isAdmin = membership?.role === "Admin";

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Dashboard</h1>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">{session.user.email}</span>
              <LogoutButton />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="rounded-lg bg-white p-6 shadow">
              <h2 className="text-lg font-semibold text-gray-900">Welcome to StockZen!</h2>
              <p className="mt-2 text-gray-600">
                You are now logged in as {session.user.name} ({membership?.role ?? "No role"}).
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href="/products"
                  className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
                >
                  View products
                </Link>
                <Link
                  href="/team"
                  className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                >
                  Manage team members
                </Link>
              </div>
              <div className="mt-6">
                <p className="text-sm text-gray-500">User ID: {session.user.id}</p>
              </div>
            </div>
          </div>

          {membership && (
            <div className="lg:col-span-1">
              <TenantThresholdsForm disabled={!isAdmin} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
