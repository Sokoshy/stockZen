/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/lib/env";

import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
};

export default config;
