import Link from "next/link";
import { redirect } from "next/navigation";

import { ForgotPasswordForm } from "~/features/auth/components/forgot-password-form";
import { getSession } from "~/server/better-auth/server";

export const metadata = {
  title: "Forgot Password - StockZen",
  description: "Request a password reset link for your StockZen account",
};

export default async function ForgotPasswordPage() {
  const session = await getSession();

  if (session) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col justify-center bg-gray-50 px-6 py-12 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-sm">
        <h2 className="mt-10 text-center text-2xl font-bold leading-9 tracking-tight text-gray-900">
          Forgot your password?
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Enter your email address and we&apos;ll send you a reset link.
        </p>
      </div>

      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
        <div className="bg-white px-6 py-12 shadow sm:rounded-lg sm:px-12">
          <ForgotPasswordForm />
        </div>

        <p className="mt-10 text-center text-sm text-gray-500">
          Remembered your password?{" "}
          <Link href="/login" className="font-semibold leading-6 text-indigo-600 hover:text-indigo-500">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
