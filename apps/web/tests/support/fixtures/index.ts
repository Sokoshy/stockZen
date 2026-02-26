import { mergeTests } from "@playwright/test";
import { test as apiRequestFixture } from "@seontechnologies/playwright-utils/api-request/fixtures";
import { test as networkErrorMonitorFixture } from "@seontechnologies/playwright-utils/network-error-monitor/fixtures";

import { test as baseFixtures } from "./base-fixtures";

export const test = mergeTests(baseFixtures, apiRequestFixture, networkErrorMonitorFixture);

export { expect } from "@playwright/test";
