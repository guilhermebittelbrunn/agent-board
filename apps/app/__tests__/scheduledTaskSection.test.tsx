import { globalTranslations } from "@repo/internationalization/translations/global";
import { parseBoardConfig } from "@repo/kanban-contract";
import type {
    BoardCredentialsDTO,
    BoardViewDTO,
    ScheduledTaskCredentialDTO,
} from "@repo/sdk/src/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScheduledTaskSection } from "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/ScheduledTaskSection";
import { queryKeys } from "@/shared/lib/queryKeys";

const { listMock, saveMock, removeMock, successAlertMock, errorAlertMock } =
    vi.hoisted(() => ({
        listMock: vi.fn(),
        saveMock: vi.fn(),
        removeMock: vi.fn(),
        successAlertMock: vi.fn(),
        errorAlertMock: vi.fn(),
    }));

vi.mock("@/shared/lib/client", () => ({
    apiClient: {
        boardCredential: {
            list: (...args: unknown[]) => listMock(...args),
            saveScheduledTask: (...args: unknown[]) => saveMock(...args),
            removeScheduledTask: (...args: unknown[]) => removeMock(...args),
        },
    },
}));
vi.mock("@repo/design-system/hooks/useAlert", () => ({
    default: () => ({
        successAlert: successAlertMock,
        errorAlert: errorAlertMock,
    }),
}));
vi.mock("@/shared/providers/ApiAuthProvider", () => ({
    useSdkAuthorized: () => true,
}));

const boardsDictionary =
    globalTranslations["pt-br"].apps.app.pages.common.boards;

const BOARD_ID = "agent-board-demo--sample-app";
const FIRE_URL_LABEL = /Fire URL/;
const TOKEN_LABEL = /^Token/;
const FORBIDDEN = 403;
const SERVICE_UNAVAILABLE = 503;
const VALID_FIRE_URL =
    "https://api.anthropic.com/v1/claude_code/routines/trig_fakeAbcd/fire";
const FAKE_TOKEN = "fake-token-for-tests-only-9z8y";

const parsedConfig = parseBoardConfig({
    version: 1,
    name: "sample",
    stages: [
        { key: "analyze", column: "Análise", command: "/analyze" },
        {
            key: "develop",
            column: "Executando",
            command: "/develop",
            runners: ["local"],
        },
        { key: "review", column: "Revisando", command: "/review" },
    ],
});
if (!parsedConfig.success) {
    throw new Error("invalid config");
}

const board = (
    effectiveRole: BoardViewDTO["access"]["effectiveRole"] = "operator"
) =>
    ({
        id: BOARD_ID,
        config: parsedConfig.data,
        access: { effectiveRole },
    }) as Pick<BoardViewDTO, "id" | "config" | "access">;

const task = (
    overrides: Partial<ScheduledTaskCredentialDTO> = {}
): ScheduledTaskCredentialDTO => ({
    stageKey: "review",
    triggerIdLast4: "Wxyz",
    tokenLast4: "1234",
    lastCheckedAt: null,
    lastCheckStatus: null,
    updatedAt: "2026-11-27T10:00:00.000Z",
    ...overrides,
});

const credentials = (
    overrides: Partial<BoardCredentialsDTO> = {}
): BoardCredentialsDTO => ({
    cloudCredentialsEnabled: true,
    scheduledTasks: [task()],
    ...overrides,
});

const apiError = (status: number, code: string) =>
    Object.assign(new Error(code), {
        isAxiosError: true,
        response: { status, data: { error: { code } } },
    });

let queryClient: QueryClient;

const draw = (role: BoardViewDTO["access"]["effectiveRole"] = "operator") =>
    render(
        <QueryClientProvider client={queryClient}>
            <ScheduledTaskSection
                board={board(role)}
                boardsDictionary={boardsDictionary}
            />
        </QueryClientProvider>
    );

const rowOf = async (column: string) => {
    const name = await screen.findByText(column);
    const row = name.closest("li");
    if (!row) {
        throw new Error(`row ${column} not found`);
    }
    return within(row);
};

const fillAndSubmit = (fireUrl: string, token: string) => {
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.change(dialog.getByLabelText(FIRE_URL_LABEL), {
        target: { value: fireUrl },
    });
    fireEvent.change(dialog.getByLabelText(TOKEN_LABEL), {
        target: { value: token },
    });
    fireEvent.click(dialog.getByRole("button", { name: "Salvar" }));
};

beforeEach(() => {
    for (const mock of [
        listMock,
        saveMock,
        removeMock,
        successAlertMock,
        errorAlertMock,
    ]) {
        mock.mockReset();
    }
    queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
});

afterEach(cleanup);

describe("ScheduledTaskSection rows", () => {
    it("shows one row per stage with saved, missing and local-only states", async () => {
        listMock.mockResolvedValue(credentials());
        draw();

        const analyze = await rowOf("Análise");
        expect(analyze.getByText("Não cadastrada")).toBeTruthy();
        expect(
            analyze.getByRole("button", {
                name: "Cadastrar a tarefa agendada de Análise",
            })
        ).toBeTruthy();

        const develop = await rowOf("Executando");
        expect(develop.getByText("Só no runner local")).toBeTruthy();
        expect(develop.getByText("o board.yml não permite nuvem")).toBeTruthy();
        expect(develop.queryAllByRole("button")).toHaveLength(0);

        const review = await rowOf("Revisando");
        expect(review.getByText("Cadastrada")).toBeTruthy();
        expect(review.getByText("…/routines/••••Wxyz")).toBeTruthy();
        expect(review.getByText("terminando em 1234")).toBeTruthy();
        expect(
            review.getByRole("button", {
                name: "Trocar a tarefa agendada de Revisando",
            })
        ).toBeTruthy();
        expect(
            review.getByRole("button", {
                name: "Remover a tarefa agendada de Revisando",
            })
        ).toBeTruthy();
        expect(listMock).toHaveBeenCalledWith(BOARD_ID);
    });

    it("hides every action from a viewer and still shows their own saved row", async () => {
        listMock.mockResolvedValue(credentials());
        draw("viewer");

        const review = await rowOf("Revisando");
        expect(review.getByText("Cadastrada")).toBeTruthy();
        expect(screen.queryAllByRole("button")).toHaveLength(0);
    });

    it("warns and disables saving when cloud credentials are switched off", async () => {
        listMock.mockResolvedValue(
            credentials({ cloudCredentialsEnabled: false })
        );
        draw();

        expect(
            await screen.findByText(
                "O cadastro na nuvem está desligado neste ambiente."
            )
        ).toBeTruthy();
        const add = screen.getByRole("button", {
            name: "Cadastrar a tarefa agendada de Análise",
        }) as HTMLButtonElement;
        const replace = screen.getByRole("button", {
            name: "Trocar a tarefa agendada de Revisando",
        }) as HTMLButtonElement;
        expect(add.disabled).toBe(true);
        expect(replace.disabled).toBe(true);
    });

    it("shows the translated error when the list fails", async () => {
        listMock.mockRejectedValue(apiError(FORBIDDEN, "BOARD_FORBIDDEN"));
        draw();

        const alert = await screen.findByRole("alert");
        expect(alert.textContent).not.toBe("");
        expect(screen.queryByText("Nuvem: tarefas agendadas por etapa")).toBe(
            null
        );
    });
});

describe("ScheduledTaskSection save dialog", () => {
    it("refuses a fire URL outside the scheduled task format without calling the API", async () => {
        listMock.mockResolvedValue(credentials({ scheduledTasks: [] }));
        draw();

        fireEvent.click(
            await screen.findByRole("button", {
                name: "Cadastrar a tarefa agendada de Análise",
            })
        );
        fillAndSubmit("https://example.com/fire", FAKE_TOKEN);

        expect(
            await screen.findByText(
                "Use a Fire URL do gatilho de API da tarefa agendada."
            )
        ).toBeTruthy();
        expect(saveMock).not.toHaveBeenCalled();
    });

    it("refuses a token shorter than 20 characters", async () => {
        listMock.mockResolvedValue(credentials({ scheduledTasks: [] }));
        draw();

        fireEvent.click(
            await screen.findByRole("button", {
                name: "Cadastrar a tarefa agendada de Análise",
            })
        );
        fillAndSubmit(VALID_FIRE_URL, "short");

        expect(
            await screen.findByText(
                "Cole o token inteiro, com pelo menos 20 caracteres."
            )
        ).toBeTruthy();
        expect(saveMock).not.toHaveBeenCalled();
    });

    it("saves, updates the row with the last characters and reopens with empty fields", async () => {
        listMock.mockResolvedValue(credentials({ scheduledTasks: [] }));
        saveMock.mockResolvedValue(
            task({
                stageKey: "analyze",
                triggerIdLast4: "Abcd",
                tokenLast4: "8y9z",
            })
        );
        draw();

        fireEvent.click(
            await screen.findByRole("button", {
                name: "Cadastrar a tarefa agendada de Análise",
            })
        );
        expect(
            screen.getByRole("heading", {
                name: "Tarefa agendada de Análise",
            })
        ).toBeTruthy();
        fillAndSubmit(VALID_FIRE_URL, FAKE_TOKEN);

        await waitFor(() => expect(screen.queryByRole("dialog")).toBe(null));
        expect(saveMock).toHaveBeenCalledWith(BOARD_ID, "analyze", {
            fireUrl: VALID_FIRE_URL,
            token: FAKE_TOKEN,
        });
        expect(successAlertMock).toHaveBeenCalledWith(
            "Tarefa agendada de Análise salva."
        );
        const analyze = await rowOf("Análise");
        expect(analyze.getByText("Cadastrada")).toBeTruthy();
        expect(analyze.getByText("…/routines/••••Abcd")).toBeTruthy();
        expect(analyze.getByText("terminando em 8y9z")).toBeTruthy();

        fireEvent.click(
            analyze.getByRole("button", {
                name: "Trocar a tarefa agendada de Análise",
            })
        );
        const dialog = within(screen.getByRole("dialog"));
        expect(
            (dialog.getByLabelText(FIRE_URL_LABEL) as HTMLInputElement).value
        ).toBe("");
        expect(
            (dialog.getByLabelText(TOKEN_LABEL) as HTMLInputElement).value
        ).toBe("");
    });

    it("keeps the dialog open with the typed values when the API refuses", async () => {
        listMock.mockResolvedValue(credentials({ scheduledTasks: [] }));
        saveMock.mockRejectedValue(
            apiError(
                SERVICE_UNAVAILABLE,
                "CREDENTIALS_ENCRYPTION_NOT_CONFIGURED"
            )
        );
        draw();

        fireEvent.click(
            await screen.findByRole("button", {
                name: "Cadastrar a tarefa agendada de Análise",
            })
        );
        fillAndSubmit(VALID_FIRE_URL, FAKE_TOKEN);

        await waitFor(() => expect(errorAlertMock).toHaveBeenCalledTimes(1));
        const message = errorAlertMock.mock.calls[0]?.[0] as string;
        expect(message).not.toContain("CREDENTIALS_ENCRYPTION_NOT_CONFIGURED");
        const dialog = within(screen.getByRole("dialog"));
        expect(
            (dialog.getByLabelText(FIRE_URL_LABEL) as HTMLInputElement).value
        ).toBe(VALID_FIRE_URL);
        expect(
            queryClient.getQueryData<BoardCredentialsDTO>(
                queryKeys.boards.credentials(BOARD_ID)
            )?.scheduledTasks
        ).toEqual([]);
    });
});

describe("ScheduledTaskSection remove dialog", () => {
    it("asks before removing and returns the row to missing", async () => {
        listMock.mockResolvedValue(credentials());
        removeMock.mockResolvedValue(undefined);
        draw();

        fireEvent.click(
            await screen.findByRole("button", {
                name: "Remover a tarefa agendada de Revisando",
            })
        );
        const dialog = within(screen.getByRole("dialog"));
        expect(
            dialog.getByRole("heading", {
                name: "Remover a tarefa agendada de Revisando?",
            })
        ).toBeTruthy();
        expect(removeMock).not.toHaveBeenCalled();

        fireEvent.click(dialog.getByRole("button", { name: "Remover" }));

        await waitFor(() => expect(screen.queryByRole("dialog")).toBe(null));
        expect(removeMock).toHaveBeenCalledWith(BOARD_ID, "review");
        expect(successAlertMock).toHaveBeenCalledWith(
            "Tarefa agendada de Revisando removida."
        );
        const review = await rowOf("Revisando");
        expect(review.getByText("Não cadastrada")).toBeTruthy();
    });

    it("cancels without calling the API", async () => {
        listMock.mockResolvedValue(credentials());
        draw();

        fireEvent.click(
            await screen.findByRole("button", {
                name: "Remover a tarefa agendada de Revisando",
            })
        );
        fireEvent.click(
            within(screen.getByRole("dialog")).getByRole("button", {
                name: "Cancelar",
            })
        );

        await waitFor(() => expect(screen.queryByRole("dialog")).toBe(null));
        expect(removeMock).not.toHaveBeenCalled();
        expect((await rowOf("Revisando")).getByText("Cadastrada")).toBeTruthy();
    });
});
