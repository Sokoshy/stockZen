"use client";

import { useState } from "react";

import { api } from "~/trpc/react";

interface AuditEventsTableProps {
  canView: boolean;
}

const actionTypeLabels: Record<string, string> = {
  login: "Login",
  logout: "Logout",
  password_reset_completed: "Password Reset",
  invite_created: "Invitation Created",
  invite_revoked: "Invitation Revoked",
  role_changed: "Role Changed",
  member_removed: "Member Removed",
  login_failed: "Login Failed",
  forbidden_attempt: "Forbidden Attempt",
};

const statusStyles: Record<string, string> = {
  success: "bg-green-100 text-green-800",
  failure: "bg-red-100 text-red-800",
};

export function AuditEventsTable({ canView }: AuditEventsTableProps) {
  const [cursor, setCursor] = useState<{ createdAt: string; id: string } | undefined>(undefined);
  const { data, isLoading, error } = api.auth.listAuditEvents.useQuery(
    { cursor, limit: 20 },
    { enabled: canView }
  );

  if (!canView) {
    return (
      <div className="rounded-lg bg-gray-50 p-6 text-center">
        <p className="text-gray-600">Only Admins can view audit logs.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="rounded-lg bg-gray-50 p-6 text-center">
        <p className="text-gray-600">Loading audit events...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-6 text-center">
        <p className="text-red-600">Error loading audit events: {error.message}</p>
      </div>
    );
  }

  const events = data?.events ?? [];
  const hasMore = !!data?.nextCursor;

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
              >
                Timestamp
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
              >
                Action
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
              >
                Status
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
              >
                User
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
              >
                Details
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {events.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-sm text-gray-500"
                >
                  No audit events found.
                </td>
              </tr>
            ) : (
              events.map((event) => (
                <tr key={event.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                    {new Date(event.createdAt).toLocaleString()}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                    {actionTypeLabels[event.actionType] ?? event.actionType}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                        statusStyles[event.status] ?? "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {event.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                    {event.actorUserId ?? "Anonymous"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {event.context ? (
                      <pre className="max-w-xs overflow-x-auto rounded bg-gray-100 p-2 text-xs">
                        {(() => {
                          try {
                            const parsed = JSON.parse(event.context);
                            return JSON.stringify(parsed, null, 2);
                          } catch {
                            return event.context;
                          }
                        })()}
                      </pre>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="flex justify-center">
          <button
            onClick={() => setCursor(data?.nextCursor ?? undefined)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Load More
          </button>
        </div>
      )}
    </div>
  );
}
