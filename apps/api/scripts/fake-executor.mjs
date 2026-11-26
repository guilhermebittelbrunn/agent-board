/**
 * Drives the fake stage executor on the emulator, so each state of a run can be produced
 * on purpose:
 *
 *   node scripts/fake-executor.mjs script <boardId> <slug> <outcome...>
 *   node scripts/fake-executor.mjs expire <boardId> <slug>
 *
 * `script` sets the outcomes the card's next runs report, in order (`success`,
 * `needs_input`, `needs_rework`, `failed` or `silent`). `expire` moves the deadline of the
 * card's live run into the past, so the next board read fails it on timeout.
 */
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readEmulatorTarget, refuseSeedReason } from "./emulatorTarget.mjs";

const OUTCOMES = ["success", "needs_input", "needs_rework", "failed", "silent"];
const USAGE = [
    "Usage:",
    "  node scripts/fake-executor.mjs script <boardId> <slug> <outcome...>",
    "  node scripts/fake-executor.mjs expire <boardId> <slug>",
    `Outcomes: ${OUTCOMES.join(", ")}`,
].join("\n");

const target = readEmulatorTarget();
const refusal = refuseSeedReason(target);

// Checked before initializeApp so a misconfigured run cannot reach a database at all.
if (refusal) {
    process.stderr.write(`${refusal}\n`);
    process.exit(1);
}

const [command, boardId, slug, ...outcomes] = process.argv.slice(2);
const unknown = outcomes.filter((outcome) => !OUTCOMES.includes(outcome));
if (
    !(boardId && slug && ["script", "expire"].includes(command)) ||
    unknown.length > 0
) {
    process.stderr.write(`${USAGE}\n`);
    process.exit(1);
}

initializeApp({ projectId: target.projectId });
const db = getFirestore();
const cardId = `${boardId}__${slug}`;

if (command === "script") {
    await db
        .collection("fakeExecutorScript")
        .doc(cardId)
        .set({ outcomes, claims: {} });
    process.stdout.write(
        `The next ${outcomes.length} runs of ${cardId} report: ${outcomes.join(", ") || "success"}.\n`
    );
} else {
    const card = await db.collection("card").doc(cardId).get();
    const runId = card.data()?.activeRunId;
    if (!runId) {
        process.stderr.write(`${cardId} has no live run.\n`);
        process.exit(1);
    }
    await db
        .collection("run")
        .doc(runId)
        .update({ deadlineAt: new Date(0) });
    process.stdout.write(
        `Run ${runId} of ${cardId} is past its deadline. Open the board to apply it.\n`
    );
}
