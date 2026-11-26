import type { RunnerJob } from "@repo/kanban-contract";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ID = /^[A-Za-z0-9_-]{1,200}$/;
const COMMAND = /^\/[a-z][a-z0-9-]*$/;
const STAGE_KEY = /^[a-z][a-z0-9-]*$/;
const REPO_PART = /^[A-Za-z0-9._-]{1,100}$/;
const BRANCH = /^[A-Za-z0-9._/-]{1,200}$/;
const MODELS = ["opus", "sonnet", "haiku"];
const EFFORTS = ["low", "medium", "high", "xhigh", "max"];

function isGitRef(value: string): boolean {
    return (
        BRANCH.test(value) &&
        !value.startsWith("-") &&
        !value.startsWith("/") &&
        !value.includes("..") &&
        !value.endsWith("/") &&
        !value.endsWith(".lock")
    );
}

/** Owner and name become folders under the runner's home, so `.` and `..` are refused. */
function isRepoPart(value: string): boolean {
    return REPO_PART.test(value) && value !== "." && value !== "..";
}

/**
 * Checks every field before it reaches git or a process. The API built the job, but the
 * runner hands these values to programs on this machine and does not trust the network.
 */
export function isSafeJob(job: RunnerJob): boolean {
    return (
        ID.test(job.runId) &&
        ID.test(job.boardId) &&
        ID.test(job.cardId) &&
        SLUG.test(job.slug) &&
        STAGE_KEY.test(job.stageKey) &&
        COMMAND.test(job.command) &&
        MODELS.includes(job.model) &&
        EFFORTS.includes(job.effort) &&
        Number.isInteger(job.maxTurns) &&
        job.maxTurns > 0 &&
        isGitRef(job.branch) &&
        isGitRef(job.repository.baseBranch) &&
        isRepoPart(job.repository.owner) &&
        isRepoPart(job.repository.name) &&
        !Number.isNaN(Date.parse(job.deadlineAt)) &&
        job.runToken.startsWith("kbr_")
    );
}
