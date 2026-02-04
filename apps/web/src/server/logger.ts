import "server-only";

import pino from "pino";

import { env } from "~/lib/env";

export const logger = pino({
  level: env.NODE_ENV === "development" ? "debug" : "info",
  base: {
    service: "web",
  },
});
