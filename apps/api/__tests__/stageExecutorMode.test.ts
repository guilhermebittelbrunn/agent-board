import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveStageExecutorMode } from "@/(shared)/lib/orchestrator/executor-mode";

const EMULATOR_VARIABLES = [
    "FIRESTORE_EMULATOR_HOST",
    "FIREBASE_AUTH_EMULATOR_HOST",
    "NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST",
] as const;

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("resolveStageExecutorMode", () => {
    it("has no executor outside the emulator, whatever else is set", () => {
        for (const variable of EMULATOR_VARIABLES) {
            vi.stubEnv(variable, "");
        }
        vi.stubEnv("STAGE_EXECUTOR", "fake");

        expect(resolveStageExecutorMode({ hasOnlineRunner: false })).toBeNull();
    });

    it("runs the fake executor against the emulator", () => {
        vi.stubEnv("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8080");
        vi.stubEnv("FIREBASE_AUTH_EMULATOR_HOST", "127.0.0.1:9099");

        expect(resolveStageExecutorMode({ hasOnlineRunner: false })).toBe(
            "fake"
        );
    });

    it("runs on the person's runner when one is online, emulated or not", () => {
        for (const variable of EMULATOR_VARIABLES) {
            vi.stubEnv(variable, "");
        }
        expect(resolveStageExecutorMode({ hasOnlineRunner: true })).toBe(
            "local"
        );

        vi.stubEnv("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8080");
        vi.stubEnv("FIREBASE_AUTH_EMULATOR_HOST", "127.0.0.1:9099");
        expect(resolveStageExecutorMode({ hasOnlineRunner: true })).toBe(
            "local"
        );
    });
});
