import Link from "next/link";
import { redirect } from "next/navigation";

import { ResetPasswordForm } from "~/features/auth/components/reset-password-form";
import { getSession } from "~/server/better-auth/server";

const INVALID_TOKEN_MESSAGE =
  "This reset link is invalid or has expired. Please request a new reset link.";

type ResetPasswordPageProps = {
  searchParams?: Promise<{
    token?: string | string[];
    error?: string | string[];
  }>;
};

function getFirstQueryValue(value: string | string[] | undefined): string {
  if (!value) {
    return "";
  }

  return Array.isArray(value) ? (value[0] ?? "") : value;
}

export const metadata = {
  title: "Reset Password - StockZen",
  description: "Set a new password for your StockZen account",
};

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const session = await getSession();

  if (session) {
    redirect("/dashboard");
  }

  const resolvedSearchParams = await searchParams;
  const token = getFirstQueryValue(resolvedSearchParams?.token);
  const error = getFirstQueryValue(resolvedSearchParams?.error);

  const initialError = token
    ? error
      ? INVALID_TOKEN_MESSAGE
      : undefined
    : INVALID_TOKEN_MESSAGE;

  return (
    <div className="flex min-h-screen flex-col justify-center bg-gray-50 px-6 py-12 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-sm">
        <h2 className="mt-10 text-center text-2xl font-bold leading-9 tracking-tight text-gray-900">
          Reset your password
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Choose a new password for your account.
        </p>
      </div>

      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
        <div className="bg-white px-6 py-12 shadow sm:rounded-lg sm:px-12">
          <ResetPasswordForm token={token} initialError={initialError} />
        </div>

        <p className="mt-10 text-center text-sm text-gray-500">
          Need a new link?{" "}
          <Link href="/forgot-password" className="font-semibold leading-6 text-indigo-600 hover:text-indigo-500">
            Request password reset
          </Link>
        </p>
      </div>
    </div>
  );
}
