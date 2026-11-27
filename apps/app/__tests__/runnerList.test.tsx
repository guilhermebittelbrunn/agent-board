import { globalTranslations } from "@repo/internationalization/translations/global";
import { parseBoardConfig } from "@repo/kanban-contract";
import type { RunnerDTO } from "@repo/sdk/src/types";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RunnerList } from "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/RunnerList";

vi.mock("@/shared/lib/formatDisplayDateTime", () => ({
    useFormatDisplayDateTime: () => (value: string) => value,
}));

const boardsDictionary =
    globalTranslations["pt-br"].apps.app.pages.common.boards;

const parsedConfig = parseBoardConfig({
    version: 1,
    name: "sample",
    stages: [{ key: "analyze", column: "Análise", command: "/analyze" }],
});
if (!parsedConfig.success) {
    throw new Error("invalid config");
}

const runner = (id: string): RunnerDTO => ({
    id,
    name: "Guilhermes-MacBook-Air",
    online: true,
    lastSeenAt: "2026-11-27T21:00:00.000Z",
    createdAt: "2026-11-27T20:48:57.000Z",
    tokenLast4: "uIOY",
    currentRun: null,
});

afterEach(cleanup);

describe("RunnerList", () => {
    it("tells apart two runners of the same machine by their short id", () => {
        render(
            <RunnerList
                board={{ id: "b", config: parsedConfig.data }}
                boardsDictionary={boardsDictionary}
                canRevoke
                onRevoke={() => null}
                runners={[
                    runner("c704GbOe9oebmZLd5h4r"),
                    runner("1weWj1eeIM1sJUvCx5bD"),
                ]}
            />
        );

        expect(screen.getByText("id c704Gb")).toBeTruthy();
        expect(screen.getByText("id 1weWj1")).toBeTruthy();
        expect(
            screen.getByRole("button", {
                name: "Revogar o runner Guilhermes-MacBook-Air (id 1weWj1)",
            })
        ).toBeTruthy();
    });
});
