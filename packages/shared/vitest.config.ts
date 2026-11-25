import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts", "src/**/*.test.ts"],
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    // Avoid tinypool terminate flaking in restricted environments.
    teardownTimeout: 1000,
  },
});
