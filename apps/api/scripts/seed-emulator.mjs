import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { readEmulatorTarget, refuseSeedReason } from "./emulatorTarget.mjs";

const target = readEmulatorTarget();
const refusal = refuseSeedReason(target);

// Checked before initializeApp so a misconfigured run cannot reach a database at all.
if (refusal) {
    process.stderr.write(`${refusal}\n`);
    process.exit(1);
}

const USERS_COLLECTION = "user";
const SEED_PASSWORD = "demo1234";

/** A second account exists so a board can be shared and a stranger's 404 can be exercised. */
const ACCOUNTS = [
    { email: "user@example.com" },
    { email: "user2@example.com" },
];

async function wipe() {
    const auth = await fetch(
        `http://${target.authHost}/emulator/v1/projects/${target.projectId}/accounts`,
        { method: "DELETE" }
    );
    const firestore = await fetch(
        `http://${target.firestoreHost}/emulator/v1/projects/${target.projectId}/databases/(default)/documents`,
        { method: "DELETE" }
    );

    if (!(auth.ok && firestore.ok)) {
        throw new Error(
            `Could not clear the emulators (auth ${auth.status}, firestore ${firestore.status}). Are they running? Start them with \`pnpm emulators\`.`
        );
    }
}

async function createAccount(auth, db, { email }) {
    const user = await auth.createUser({
        email,
        password: SEED_PASSWORD,
        // Seeded accounts behave like confirmed ones.
        emailVerified: true,
    });

    const now = new Date();
    await db.collection(USERS_COLLECTION).add({
        reference_id: user.uid,
        createdAt: now,
        updatedAt: now,
        // Not decorative: every lookup filters on `deletedAt == null`, and Firestore
        // does not match a missing field against null, so the profile would be invisible.
        deletedAt: null,
    });
}

async function main() {
    initializeApp({ projectId: target.projectId });
    const auth = getAuth();
    const db = getFirestore();

    await wipe();

    for (const account of ACCOUNTS) {
        await createAccount(auth, db, account);
    }

    process.stdout.write(
        [
            `Seeded the emulated project "${target.projectId}". Every account uses the password ${SEED_PASSWORD}.`,
            "",
            ...ACCOUNTS.map((account) => `  ${account.email}`),
            "",
            "This state lives only in the emulators and is rebuilt from scratch every run.",
            "",
        ].join("\n")
    );
}

main().catch((error) => {
    process.stderr.write(`Failed to seed: ${error?.message ?? error}\n`);
    process.exit(1);
});
