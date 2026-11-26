import { globalTranslations } from "@repo/internationalization/translations/global";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { restoreRunDialogFocus } from "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/runDialogFocus";
import { TriggerStageDialog } from "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/TriggerStageDialog";
import { runBoard, runCard } from "./runCardFixtures";

const drawCard = ({
    menu = true,
    runControls = true,
}: {
    menu?: boolean;
    runControls?: boolean;
} = {}) =>
    render(
        <div>
            <a data-card-link="c1" href="/cards/search">
                search
            </a>
            {menu ? (
                <span data-card-menu="c1">
                    <button type="button">menu</button>
                </span>
            ) : null}
            {runControls ? (
                <div data-run-controls="c1">
                    <button type="button">parar</button>
                </div>
            ) : null}
            <span data-card-menu="c2">
                <button type="button">menu de outro card</button>
            </span>
        </div>
    );

afterEach(cleanup);

describe("restoreRunDialogFocus", () => {
    it("gives the focus back to the control that opened the dialog when it is still there", () => {
        drawCard();
        const opener = screen.getByRole("button", { name: "parar" });

        restoreRunDialogFocus("c1", opener);

        expect(document.activeElement).toBe(opener);
    });

    it("falls back to the card's menu when the opener is gone or was the page", () => {
        drawCard();
        const gone = document.createElement("button");

        restoreRunDialogFocus("c1", gone);
        expect(document.activeElement).toBe(
            screen.getByRole("button", { name: "menu" })
        );

        (document.activeElement as HTMLElement).blur();
        restoreRunDialogFocus("c1", document.body);
        expect(document.activeElement).toBe(
            screen.getByRole("button", { name: "menu" })
        );
    });

    it("falls back to the card's menu when the opener is in the page but cannot take the focus", () => {
        drawCard();
        const hiddenMenuItem = document.createElement("li");
        hiddenMenuItem.setAttribute("role", "menuitem");
        document.body.append(hiddenMenuItem);

        restoreRunDialogFocus("c1", hiddenMenuItem);

        expect(hiddenMenuItem.isConnected).toBe(true);
        expect(document.activeElement).toBe(
            screen.getByRole("button", { name: "menu" })
        );
        hiddenMenuItem.remove();
    });

    it("uses the card's run buttons, then its link, when the card has no menu", () => {
        drawCard({ menu: false });
        restoreRunDialogFocus("c1", null);
        expect(document.activeElement).toBe(
            screen.getByRole("button", { name: "parar" })
        );

        cleanup();
        drawCard({ menu: false, runControls: false });
        restoreRunDialogFocus("c1", null);
        expect(document.activeElement).toBe(
            screen.getByRole("link", { name: "search" })
        );
    });

    it("is wired to the dialog: closing it runs the restore hook", async () => {
        const onCloseAutoFocus = vi.fn();
        const props = {
            board: runBoard(),
            boardsDictionary:
                globalTranslations["pt-br"].apps.app.pages.common.boards,
            cards: [],
            isPending: false,
            onCancel: vi.fn(),
            onCloseAutoFocus,
            onConfirm: vi.fn(),
        };
        const { rerender } = render(
            <TriggerStageDialog
                {...props}
                request={{
                    card: runCard("search"),
                    stageKey: "analyze",
                    kind: "rerun",
                }}
            />
        );
        rerender(<TriggerStageDialog {...props} request={null} />);

        await waitFor(() => expect(onCloseAutoFocus).toHaveBeenCalledTimes(1));
    });
});
