import { globalTranslations } from "@repo/internationalization/translations/global";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RunnerRegistrationPanel } from "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/RunnerRegistrationPanel";

vi.mock("@/shared/lib/formatDisplayDateTime", () => ({
    useFormatDisplayDateTime: () => (value: string) => value,
}));

const boardsDictionary =
    globalTranslations["pt-br"].apps.app.pages.common.boards;
const registerCopy = boardsDictionary.credentials.register;
const API = "https://agent-board-api.example";

function renderPanel(
    overrides: Partial<Parameters<typeof RunnerRegistrationPanel>[0]> = {}
) {
    return render(
        <RunnerRegistrationPanel
            apiUrl={API}
            boardsDictionary={boardsDictionary}
            canGenerate
            expired={false}
            hasRunners={false}
            isGenerating={false}
            onGenerate={() => null}
            registeredName={null}
            registration={null}
            {...overrides}
        />
    );
}

afterEach(cleanup);

describe("RunnerRegistrationPanel", () => {
    it("walks a first runner through every step, each with why it exists", () => {
        renderPanel();

        expect(
            screen.getByRole("heading", { name: registerCopy.title })
        ).toBeTruthy();
        for (const step of [
            registerCopy.prerequisites,
            registerCopy.install,
            registerCopy.registerStep,
            registerCopy.startStep,
            registerCopy.parallel,
            registerCopy.update,
        ]) {
            expect(screen.getByText(step.title)).toBeTruthy();
            expect(screen.getByText(step.why)).toBeTruthy();
        }
        expect(
            screen.getByText("pnpm install && pnpm --filter runner install-bin")
        ).toBeTruthy();
        expect(screen.getByText("agent-board-runner start")).toBeTruthy();
        expect(screen.getByText(registerCopy.registerStep.hint)).toBeTruthy();
    });

    it("shows the register command with the code and this board's API once a code exists", () => {
        renderPanel({
            registration: {
                code: "KQ7M-4XPD",
                expiresAt: "2026-11-27T21:10:00.000Z",
            },
        });

        expect(
            screen.getByText(
                `agent-board-runner register KQ7M-4XPD --api ${API}`
            )
        ).toBeTruthy();
        expect(screen.getByText(registerCopy.waiting)).toBeTruthy();
    });

    it("folds the first-time steps for someone who already has a runner", () => {
        renderPanel({ hasRunners: true });

        expect(
            screen.getByRole("heading", { name: registerCopy.titleAnother })
        ).toBeTruthy();
        expect(screen.queryByText(registerCopy.install.why)).toBeNull();
        expect(screen.getByText(registerCopy.startStep.why)).toBeTruthy();

        fireEvent.click(
            screen.getByRole("button", { name: registerCopy.firstTime })
        );
        expect(screen.getByText(registerCopy.install.why)).toBeTruthy();
    });
});
