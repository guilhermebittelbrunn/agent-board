/**
 * Issues an agent token for the live run of a card on the emulator, the way a runner
 * will receive it, so the agent endpoints can be called by hand:
 *
 *   node scripts/agent-token.mjs <boardId> <slug> [--expired]
 *
 * The token is printed once, on this terminal only; the run keeps just its hash.
 * `--expired` stores an expiry in the past, to see the expired-token refusal.
 */
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { mintRunToken } from "./agentTokenMint.mjs";
import { readEmulatorTarget, refuseSeedReason } from "./emulatorTarget.mjs";

const USAGE =
    "Usage: node scripts/agent-token.mjs <boardId> <slug> [--expired]";

const target = readEmulatorTarget();
const refusal = refuseSeedReason(target);

// Checked before initializeApp so a misconfigured run cannot reach a database at all.
if (refusal) {
    process.stderr.write(`${refusal}\n`);
    process.exit(1);
}

const args = process.argv.slice(2);
const expired = args.includes("--expired");
const [boardId, slug] = args.filter((arg) => arg !== "--expired");
if (!(boardId && slug)) {
    process.stderr.write(`${USAGE}\n`);
    process.exit(1);
}

initializeApp({ projectId: target.projectId });
const db = getFirestore();
const cardId = `${boardId}__${slug}`;

const card = await db.collection("card").doc(cardId).get();
const runId = card.data()?.activeRunId;
if (!runId) {
    process.stderr.write(`${cardId} has no live run.\n`);
    process.exit(1);
}
const runRef = db.collection("run").doc(runId);
const run = (await runRef.get()).data();
if (!(run?.active === true && run.status === "running" && run.deadlineAt)) {
    process.stderr.write(`Run ${runId} of ${cardId} is not running.\n`);
    process.exit(1);
}

const { token, tokenHash } = mintRunToken(runId);
const tokenExpiresAt = expired ? new Date(0) : run.deadlineAt;
await runRef.update({ tokenHash, tokenExpiresAt, updatedAt: new Date() });
process.stdout.write(`${token}\n`);
