import { readFileSync } from "node:fs";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { buildTimelineDocuments } from "./cardTimelineFixture.mjs";
import { readEmulatorTarget, refuseSeedReason } from "./emulatorTarget.mjs";

const target = readEmulatorTarget();
const refusal = refuseSeedReason(target);

// Checked before initializeApp so a misconfigured run cannot reach a database at all.
if (refusal) {
    process.stderr.write(`${refusal}\n`);
    process.exit(1);
}

const [boardId, slug] = process.argv.slice(2);
if (!(boardId && slug)) {
    process.stderr.write(
        "Usage: pnpm --filter api seed:timeline <boardId> <slug>\n"
    );
    process.exit(1);
}

const fixture = JSON.parse(
    readFileSync(
        new URL("./fixtures/card-timeline.json", import.meta.url),
        "utf8"
    )
);

initializeApp({ projectId: target.projectId });
const db = getFirestore();

const { cardId, events, pendingAsk } = buildTimelineDocuments(fixture, {
    boardId,
    slug,
    now: new Date(),
});

const cardRef = db.collection("card").doc(cardId);
const card = await cardRef.get();
if (!card.exists) {
    process.stderr.write(
        `Card ${cardId} not found. Sync the backlog of the board first.\n`
    );
    process.exit(1);
}

// Fixed ids: running it again rewrites the same events and reopens the questions.
const batch = db.batch();
for (const event of events) {
    batch.set(db.collection("cardEvent").doc(event.id), event.document);
}
batch.update(cardRef, { pendingAsk, updatedAt: new Date() });
await batch.commit();

process.stdout.write(
    `Wrote ${events.length} events on ${cardId} and opened ${pendingAsk.count} questions.\n`
);
