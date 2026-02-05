import { redirect } from "next/navigation";

import { getSession } from "~/server/better-auth/server";

export const metadata = {
  title: "Dashboard - StockZen",
  description: "Your StockZen dashboard",
};

export default async function DashboardPage() {
  const session = await getSession();

  if (!session) {
    redirect("/signup");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">
              Dashboard
            </h1>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">
                {session.user.email}
              </span>
              <form
                action={async () => {
                  "use server";
                  const { auth } = await import("~/server/better-auth");
                  const { headers } = await import("next/headers");
                  await auth.api.signOut({
                    headers: await headers(),
                  });
                  redirect("/");
                }}
              >
                <button
                  type="submit"
                  className="rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="text-lg font-semibold text-gray-900">
            Welcome to StockZen!
          </h2>
          <p className="mt-2 text-gray-600">
            Your account has been created successfully. You are now logged in as{" "}
            {session.user.name}.
          </p>
          <div className="mt-6">
            <p className="text-sm text-gray-500">
              User ID: {session.user.id}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

import { headers } from "next/headers";
