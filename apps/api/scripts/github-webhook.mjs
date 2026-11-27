/**
 * Sends a signed GitHub webhook about a card's pull request to the local API, so the pull
 * request flow can be walked on the emulator without a GitHub App:
 *
 *   node scripts/github-webhook.mjs <boardId> <slug> <event> [--login <login>] [--app <slug>]
 *
 * The API and this script must share GITHUB_WEBHOOK_SECRET; generate one for the session
 * (`export GITHUB_WEBHOOK_SECRET=$(openssl rand -hex 32)`) before starting the API. Only
 * the response status and body are printed, never the secret.
 */
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readEmulatorTarget, refuseSeedReason } from "./emulatorTarget.mjs";
import {
    buildWebhook,
    signWebhook,
    WEBHOOK_EVENTS,
} from "./githubWebhookPayload.mjs";

const USAGE = [
    "Usage: node scripts/github-webhook.mjs <boardId> <slug> <event> [--login <login>] [--app <slug>]",
    `Events: ${WEBHOOK_EVENTS.join(", ")}`,
].join("\n");

const target = readEmulatorTarget();
const refusal = refuseSeedReason(target);

// Checked before initializeApp so a misconfigured run cannot reach a database at all.
if (refusal) {
    process.stderr.write(`${refusal}\n`);
    process.exit(1);
}

const secret = process.env.GITHUB_WEBHOOK_SECRET;
if (!secret) {
    process.stderr.write(
        "GITHUB_WEBHOOK_SECRET is not set. Export the same value in this shell and in the API's: export GITHUB_WEBHOOK_SECRET=$(openssl rand -hex 32)\n"
    );
    process.exit(1);
}

const args = process.argv.slice(2);
const option = (name, fallback) => {
    const index = args.indexOf(name);
    if (index === -1) {
        return fallback;
    }
    const value = args[index + 1];
    args.splice(index, 2);
    return value ?? fallback;
};
const login = option("--login", "qa-pr-flow");
const app = option("--app", "github-actions");
const [boardId, slug, kind] = args;
if (!(boardId && slug && WEBHOOK_EVENTS.includes(kind))) {
    process.stderr.write(`${USAGE}\n`);
    process.exit(1);
}

initializeApp({ projectId: target.projectId });
const db = getFirestore();
const [boardSnap, cardSnap] = await Promise.all([
    db.collection("board").doc(boardId).get(),
    db.collection("card").doc(`${boardId}__${slug}`).get(),
]);
const fullName = boardSnap.data()?.repository?.fullName;
const pullRequest = cardSnap.data()?.pullRequest;
if (!(fullName && pullRequest?.number)) {
    process.stderr.write(
        `${boardId}/${slug} has no pull request yet; take the card to the pull request stage first.\n`
    );
    process.exit(1);
}

const { event, body } = buildWebhook(kind, {
    fullName,
    pullRequest,
    login,
    app,
});
const payload = JSON.stringify(body);
const apiUrl = (process.env.API_URL || "http://localhost:3002").replace(
    /\/$/,
    ""
);
const response = await fetch(`${apiUrl}/github/webhook`, {
    method: "POST",
    headers: {
        "content-type": "application/json",
        "x-github-event": event,
        "x-github-delivery": crypto.randomUUID(),
        "x-hub-signature-256": signWebhook(payload, secret),
    },
    body: payload,
});
process.stdout.write(`${response.status} ${await response.text()}\n`);
