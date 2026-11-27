import type { BoardCredentialsDTO } from "@repo/sdk/src/types";
import { credentialsKey } from "@/(shared)/lib/credentials/credentials-key";
import { toScheduledTaskCredentialDTO } from "@/(shared)/mappers/credential.mapper";
import { credentialRepository } from "@/(shared)/repositories/credential.repository";
import { requireBoardApi } from "@/app/(guards)/board";
import { env } from "@/env";

/** The signed-in person's own credentials on the board; nobody lists another member's. */
export const GET = requireBoardApi("view", async (_req, ctx) => {
    const credentials = await credentialRepository.listOwned(
        ctx.board.id,
        ctx.profile.id
    );
    const data: BoardCredentialsDTO = {
        cloudCredentialsEnabled: credentialsKey(env) !== null,
        scheduledTasks: credentials
            .filter((credential) => credential.kind === "scheduled_task")
            .map(toScheduledTaskCredentialDTO),
    };
    return Response.json({ data });
});
