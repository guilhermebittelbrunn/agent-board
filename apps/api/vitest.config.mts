import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "node",
        // These need the Firestore and Storage emulators running; `test:emulator` owns them.
        exclude: [...configDefaults.exclude, "**/*.emulator.test.ts"],
        // The 5s default is a wall-clock budget, and this suite mounts dozens of
        // environments in parallel: a test doing ~300ms of real work has been observed
        // taking 7s purely waiting to be scheduled. Loose enough not to produce a false
        // negative, tight enough to still catch a genuine hang.
        testTimeout: 20_000,
    },
    resolve: {
        alias: {
            // The `@repo` alias below maps to folders, so a package `exports` subpath that is
            // not a folder has to be spelled out or Node loads the raw `.ts` file.
            "@repo/kanban-contract/board-config-yaml": path.resolve(
                __dirname,
                "../../packages/kanban-contract/src/boardConfigYaml.ts"
            ),
            "@repo/kanban-contract/spec-frontmatter": path.resolve(
                __dirname,
                "../../packages/kanban-contract/src/specFrontmatter.ts"
            ),
            "@": path.resolve(__dirname, "./"),
            "@repo": path.resolve(__dirname, "../../packages"),
        },
    },
});
