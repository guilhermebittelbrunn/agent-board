import type { CredentialCheckStatus } from "@repo/kanban-contract";

/** A scheduled task of the signed-in person for one stage. The fire URL and the token never leave the API. */
export type ScheduledTaskCredentialDTO = {
    stageKey: string;
    triggerIdLast4: string;
    tokenLast4: string;
    lastCheckedAt: string | null;
    lastCheckStatus: CredentialCheckStatus | null;
    updatedAt: string;
};

export type BoardCredentialsDTO = {
    cloudCredentialsEnabled: boolean;
    scheduledTasks: ScheduledTaskCredentialDTO[];
};

export type SaveScheduledTaskRequest = { fireUrl: string; token: string };
