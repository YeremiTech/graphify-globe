import { defineConfig } from "vite";
const base = process.env.GITHUB_PAGES_BASE || "./";
var stdin_default = defineConfig({
  base,
  esbuild: {
    jsx: "automatic"
  },
  build: {
    target: "es2022",
    sourcemap: false
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.js"]
  }
});
export {
  stdin_default as default
};
