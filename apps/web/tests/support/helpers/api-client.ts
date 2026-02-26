import type { APIRequestContext } from "@playwright/test";

type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type ApiClientOptions = {
  method: ApiMethod;
  path: string;
  data?: unknown;
  headers?: Record<string, string>;
};

export async function apiClient<T>(request: APIRequestContext, options: ApiClientOptions): Promise<T> {
  const response = await request.fetch(options.path, {
    method: options.method,
    data: options.data,
    headers: options.headers,
  });

  if (!response.ok()) {
    throw new Error(`API request failed (${response.status()}): ${options.method} ${options.path}`);
  }

  return (await response.json()) as T;
}
