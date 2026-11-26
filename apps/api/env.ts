import { keys as auth } from "@repo/auth/keys";
import { keys as core } from "@repo/next-config/keys";
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
    extends: [auth(), core()],
    // Firestore is the API's database, reached with this service account. Unlike the
    // front-ends, the API cannot start in any useful state without it.
    server: {
        FIREBASE_ADMIN_PROJECT_ID: z.string().min(1),
        FIREBASE_ADMIN_CLIENT_EMAIL: z.string().email(),
        FIREBASE_ADMIN_PRIVATE_KEY: z.string().min(1),
        // Comma-separated list of browser origins allowed to call this API.
        // Optional on purpose: this module is validated eagerly and is imported by
        // route handlers, so requiring it here would make every build — in any
        // environment — demand a production value. Production is guarded at boot,
        // in `instrumentation.ts`.
        CORS_ORIGIN: z.string().optional(),
        // Redeclared even though `auth()` already provides it: `skipValidation` makes
        // createEnv answer with this module's own `runtimeEnv` and drop everything
        // inherited, which below is every development run — and the upload capability
        // would read as switched off on every local machine.
        FIREBASE_STORAGE_BUCKET: z.string().optional(),
        GITHUB_APP_ID: z.string().regex(/^\d+$/).optional(),
        GITHUB_APP_PRIVATE_KEY: z.string().optional(),
        GITHUB_WEBHOOK_SECRET: z.string().optional(),
    },
    // Redeclared even though `core()` already provides it: `skipValidation` makes
    // createEnv answer with this module's own `runtimeEnv` and drop everything inherited,
    // which below is every development run.
    client: {
        NEXT_PUBLIC_APP_URL: z.url().optional(),
    },
    runtimeEnv: {
        FIREBASE_ADMIN_PROJECT_ID: process.env.FIREBASE_ADMIN_PROJECT_ID,
        FIREBASE_ADMIN_CLIENT_EMAIL: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        FIREBASE_ADMIN_PRIVATE_KEY: process.env.FIREBASE_ADMIN_PRIVATE_KEY,
        CORS_ORIGIN: process.env.CORS_ORIGIN,
        FIREBASE_STORAGE_BUCKET:
            process.env.FIREBASE_STORAGE_BUCKET ||
            process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
            undefined,
        GITHUB_APP_ID: process.env.GITHUB_APP_ID || undefined,
        GITHUB_APP_PRIVATE_KEY: process.env.GITHUB_APP_PRIVATE_KEY || undefined,
        GITHUB_WEBHOOK_SECRET: process.env.GITHUB_WEBHOOK_SECRET || undefined,
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    },
    skipValidation: process.env.NODE_ENV === "development",
});
