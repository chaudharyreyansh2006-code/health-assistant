import { generateId } from "ai";
export function generateRandomTestUser() {
  const email = `test-${Date.now()}-${Math.random().toString(36).slice(2)}@playwright.com`;
  const password = generateId();

  return {
    email,
    password,
  };
}

export function generateTestMessage() {
  return `Test message ${Date.now()}`;
}
