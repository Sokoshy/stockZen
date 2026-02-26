import { faker } from "@faker-js/faker";

export type UserFactoryData = {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: "admin" | "manager" | "operator";
  password: string;
  createdAt: string;
};

export function createUser(overrides: Partial<UserFactoryData> = {}): UserFactoryData {
  return {
    id: faker.string.uuid(),
    tenantId: faker.string.uuid(),
    email: faker.internet.email(),
    name: faker.person.fullName(),
    role: "manager",
    password: faker.internet.password({ length: 16 }),
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}
