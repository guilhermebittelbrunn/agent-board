import { fileURLToPath } from "node:url";

export const E2E_ROOT = fileURLToPath(new URL("..", import.meta.url));
export const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
export const APPS_ROOT = fileURLToPath(new URL("../..", import.meta.url));

export const AUTH_STATE = {
    common: fileURLToPath(new URL("../.auth/common.json", import.meta.url)),
} as const;
