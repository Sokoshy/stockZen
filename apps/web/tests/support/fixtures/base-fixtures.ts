import { test as base } from "@playwright/test";

import { createUser, type UserFactoryData } from "../factories/user-factory";

type CleanupTask = () => Promise<void> | void;

class CleanupRegistry {
  private readonly tasks: CleanupTask[] = [];

  add(task: CleanupTask): void {
    this.tasks.push(task);
  }

  async run(): Promise<void> {
    const tasks = [...this.tasks].reverse();
    this.tasks.length = 0;

    const errors: string[] = [];
    for (const task of tasks) {
      try {
        await task();
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "Unknown cleanup error");
      }
    }

    if (errors.length > 0) {
      throw new Error(`Cleanup failed: ${errors.join(" | ")}`);
    }
  }
}

type FrameworkFixtures = {
  cleanup: CleanupRegistry;
  testUser: UserFactoryData;
};

export const test = base.extend<FrameworkFixtures>({
  cleanup: async ({}, use) => {
    const cleanup = new CleanupRegistry();
    await use(cleanup);
    await cleanup.run();
  },
  testUser: async ({}, use) => {
    const testUser = createUser();
    await use(testUser);
  },
});

export { expect } from "@playwright/test";
