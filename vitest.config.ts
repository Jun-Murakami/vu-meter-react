import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vitest/config";

// Vitest 設定
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.{test,spec}.?(c|m)[jt]s?(x)"],
    css: true,
  },
});
