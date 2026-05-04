import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: { ignorePatterns: ["docs/**"] },
  lint: { ignorePatterns: ["docs/**"], options: { typeAware: true, typeCheck: true } },
  run: {
    cache: true,
  },
});
