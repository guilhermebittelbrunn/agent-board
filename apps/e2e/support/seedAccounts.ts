// Mirrors apps/api/scripts/seed-emulator.mjs. These accounts exist only in the emulators,
// which is why the password can be written down here and in docs/SETUP.md.
export const SEED_PASSWORD = "demo1234";

export type SeedAccount = { email: string; password: string };

export const SEED_ACCOUNTS = {
    common: { email: "user@example.com", password: SEED_PASSWORD },
} satisfies Record<string, SeedAccount>;
