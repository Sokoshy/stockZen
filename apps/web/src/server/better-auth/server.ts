import { auth } from ".";
import { unstable_noStore as noStore } from "next/cache";
import { headers } from "next/headers";

export async function getSession() {
  noStore();
  return auth.api.getSession({ headers: await headers() });
}
