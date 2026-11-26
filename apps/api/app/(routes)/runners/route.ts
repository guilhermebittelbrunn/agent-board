import { toRunnerDTO } from "@/(shared)/mappers/runner.mapper";
import { runnerRepository } from "@/(shared)/repositories/runner.repository";
import { requireCommonPanelApi } from "@/app/(guards)/common-panel";

/** The person's own runners, never anyone else's, and never a token or its hash. */
export const GET = requireCommonPanelApi(async (_req, ctx) => {
    const now = new Date();
    const runners = await runnerRepository.listByUser(ctx.subjectProfile.id);
    const runs = await runnerRepository.findRunsByIds(
        runners
            .map((runner) => runner.currentRunId)
            .filter((runId): runId is string => runId !== null)
    );
    const data = runners
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .map((runner) =>
            toRunnerDTO(
                runner,
                runner.currentRunId === null
                    ? null
                    : (runs.get(runner.currentRunId) ?? null),
                now
            )
        );
    return Response.json({ data });
});
