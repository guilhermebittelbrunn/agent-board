export type RunnerCurrentRunDTO = {
    boardId: string;
    cardId: string;
    slug: string;
    stageKey: string;
};

/** A local runner of the signed-in person. The token never leaves the API after registration. */
export type RunnerDTO = {
    id: string;
    name: string;
    online: boolean;
    lastSeenAt: string;
    createdAt: string;
    tokenLast4: string;
    currentRun: RunnerCurrentRunDTO | null;
};

export type RunnerRegistrationDTO = { code: string; expiresAt: string };
