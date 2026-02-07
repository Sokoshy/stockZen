import "server-only";

import pino from "pino";

import { env } from "~/lib/env";

export const logger = pino({
  level: env.NODE_ENV === "development" ? "debug" : "info",
  base: {
    service: "web",
  },
  redact: {
    paths: [
      "password",
      "*.password",
      "token",
      "*.token",
      "headers.authorization",
      "req.headers.authorization",
      "authorization",
    ],
    censor: "[REDACTED]",
  },
});
