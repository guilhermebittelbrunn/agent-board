import { globalTranslations } from "@repo/internationalization/translations/global";
import { ATTACHMENT_MAX_BYTES } from "@repo/kanban-contract";
import type { BoardViewDTO } from "@repo/sdk/src/types";
import { HTTP_STATUS } from "@repo/shared/utils/helpers/httpStatus";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NewSpecDialog } from "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/NewSpecDialog";
import { runBoard, runCard } from "./runCardFixtures";

const { createMock, uploadMock, successAlertMock, errorAlertMock } = vi.hoisted(
    () => ({
        createMock: vi.fn(),
        uploadMock: vi.fn(),
        successAlertMock: vi.fn(),
        errorAlertMock: vi.fn(),
    })
);

vi.mock("@/shared/lib/client", () => ({
    apiClient: {
        boardDraft: {
            create: (...args: unknown[]) => createMock(...args),
            uploadAttachment: (...args: unknown[]) => uploadMock(...args),
        },
    },
}));
vi.mock("@repo/design-system/hooks/useAlert", () => ({
    default: () => ({
        successAlert: successAlertMock,
        errorAlert: errorAlertMock,
    }),
}));

const boardsDictionary =
    globalTranslations["pt-br"].apps.app.pages.common.boards;
const SUBMIT = "Começar a spec";
const ATTACH = "Anexar print, PDF ou texto";

const board = (overrides: Partial<BoardViewDTO> = {}) =>
    ({
        ...runBoard(),
        id: "b",
        storageAvailable: true,
        ...overrides,
    }) as BoardViewDTO;

const apiError = (status: number, code: string) =>
    Object.assign(new Error(code), {
        isAxiosError: true,
        response: { status, data: { error: { code } } },
    });

const file = (name: string, type: string, size = 10) =>
    new File([new Uint8Array(size)], name, { type });

const draw = (target = board()) => {
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
    render(
        <QueryClientProvider client={queryClient}>
            <NewSpecDialog
                board={target}
                boardsDictionary={boardsDictionary}
                onCreated={onCreated}
                onOpenChange={onOpenChange}
                open
            />
        </QueryClientProvider>
    );
    return { onCreated, onOpenChange };
};

const typeRequest = (text: string) =>
    fireEvent.change(screen.getByLabelText("O que você quer construir?"), {
        target: { value: text },
    });

const pick = (...files: File[]) => {
    const input = document.querySelector(
        'input[type="file"]'
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files } });
};

const submitButton = () =>
    screen.getByRole("button", { name: SUBMIT }) as HTMLButtonElement;

beforeEach(() => {
    for (const mock of [
        createMock,
        uploadMock,
        successAlertMock,
        errorAlertMock,
    ]) {
        mock.mockReset();
    }
});
afterEach(cleanup);

describe("NewSpecDialog", () => {
    it("creates a text-only draft and hands the slug back", async () => {
        createMock.mockResolvedValue({
            card: runCard("aviso-no-slack", { lane: "drafts" }),
            run: { id: "r1" },
        });
        const { onCreated } = draw();

        typeRequest("Quero aviso no Slack");
        fireEvent.click(submitButton());

        await waitFor(() =>
            expect(onCreated).toHaveBeenCalledWith("aviso-no-slack")
        );
        expect(createMock).toHaveBeenCalledWith("b", {
            text: "Quero aviso no Slack",
            attachments: [],
        });
        expect(uploadMock).not.toHaveBeenCalled();
    });

    it("refuses a blank request without calling the API", async () => {
        draw();

        typeRequest("   ");
        fireEvent.click(submitButton());

        expect(
            await screen.findByText("Descreva o que você quer construir.")
        ).toBeTruthy();
        expect(createMock).not.toHaveBeenCalled();
    });

    it("uploads each file before creating the draft with the uploaded paths", async () => {
        uploadMock.mockImplementation((_boardId: string, picked: File) =>
            Promise.resolve({
                path: `uploads/u1/${picked.name}`,
                name: picked.name,
                contentType: picked.type,
                size: picked.size,
            })
        );
        createMock.mockResolvedValue({
            card: runCard("com-anexos", { lane: "drafts" }),
            run: { id: "r1" },
        });
        const { onCreated } = draw();

        typeRequest("Com anexos");
        pick(file("tela.png", "image/png"), file("doc.pdf", "application/pdf"));
        expect(screen.getByText("tela.png")).toBeTruthy();
        expect(screen.getByText("doc.pdf")).toBeTruthy();
        fireEvent.click(submitButton());

        await waitFor(() =>
            expect(onCreated).toHaveBeenCalledWith("com-anexos")
        );
        expect(uploadMock).toHaveBeenCalledTimes(2);
        expect(createMock).toHaveBeenCalledWith("b", {
            text: "Com anexos",
            attachments: [
                { path: "uploads/u1/tela.png", name: "tela.png" },
                { path: "uploads/u1/doc.pdf", name: "doc.pdf" },
            ],
        });
    });

    it("keeps the dialog and creates nothing when an upload is refused", async () => {
        uploadMock.mockRejectedValue(
            apiError(
                HTTP_STATUS.UNSUPPORTED_MEDIA_TYPE,
                "SPEC_DRAFT_ATTACHMENT_TYPE_NOT_ALLOWED"
            )
        );
        const { onCreated } = draw();

        typeRequest("Com anexo ruim");
        pick(file("notas.txt", "text/plain"));
        fireEvent.click(submitButton());

        await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(1));
        expect(createMock).not.toHaveBeenCalled();
        expect(onCreated).not.toHaveBeenCalled();
        expect(screen.getByText("notas.txt")).toBeTruthy();
        expect(
            screen.getByText(
                "Formato não aceito. Anexe imagem (PNG, JPEG, WebP), PDF ou texto (.txt, .md)."
            )
        ).toBeTruthy();
    });

    it("refuses a sixth file in the picker", () => {
        draw();

        pick(
            ...["a", "b", "c", "d", "e", "f"].map((name) =>
                file(`${name}.png`, "image/png")
            )
        );

        expect(screen.getByRole("alert").textContent).toBe(
            "No máximo 5 anexos por spec."
        );
        expect(screen.queryByText("a.png")).toBeNull();
    });

    it("refuses a file of another type or over the size limit in the picker", () => {
        draw();

        pick(file("setup.exe", "application/x-msdownload"));
        expect(screen.getByRole("alert").textContent).toBe(
            "setup.exe não é imagem (PNG, JPEG, WebP), PDF nem texto (.txt, .md)."
        );

        pick(file("grande.png", "image/png", ATTACHMENT_MAX_BYTES + 1));
        expect(screen.getByRole("alert").textContent).toBe(
            "grande.png passa de 3 MB."
        );
    });

    it("accepts a .md file whose type the browser left empty", () => {
        draw();

        pick(file("notas.md", ""));

        expect(screen.queryByRole("alert")).toBeNull();
        expect(screen.getByText("notas.md")).toBeTruthy();
    });

    it("hides the attachments when storage is off and still allows text", () => {
        draw(board({ storageAvailable: false }));

        expect(
            screen.getByText(
                "Anexos estão desligados neste ambiente: o armazenamento de arquivos não está configurado."
            )
        ).toBeTruthy();
        expect(screen.queryByRole("button", { name: ATTACH })).toBeNull();
        expect(document.querySelector('input[type="file"]')).toBeNull();
        expect(submitButton().disabled).toBe(false);
    });

    it("disables the start without an executor and says why", () => {
        draw(board({ executor: null }));

        expect(submitButton().disabled).toBe(true);
        expect(
            screen.getByText(boardsDictionary.board.noExecutor)
        ).toBeTruthy();
    });

    it("says the fake executor simulates the result", () => {
        draw();

        expect(
            screen.getByText("Executor de teste · o resultado é simulado")
        ).toBeTruthy();
    });

    it("keeps the text when creating the draft fails", async () => {
        createMock.mockRejectedValue(
            apiError(
                HTTP_STATUS.SERVICE_UNAVAILABLE,
                "RUN_EXECUTOR_UNAVAILABLE"
            )
        );
        const { onCreated } = draw();

        typeRequest("Sem executor");
        fireEvent.click(submitButton());

        await waitFor(() => expect(errorAlertMock).toHaveBeenCalledTimes(1));
        expect(onCreated).not.toHaveBeenCalled();
        expect(
            (
                screen.getByLabelText(
                    "O que você quer construir?"
                ) as HTMLTextAreaElement
            ).value
        ).toBe("Sem executor");
    });
});
