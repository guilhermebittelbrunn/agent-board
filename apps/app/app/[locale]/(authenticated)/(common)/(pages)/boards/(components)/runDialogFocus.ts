const byCard = (
    root: ParentNode,
    attribute: "cardMenu" | "runControls" | "cardLink",
    cardId: string
): HTMLElement | undefined => {
    const selector = `[data-${attribute.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}]`;
    return Array.from(root.querySelectorAll<HTMLElement>(selector)).find(
        (element) => element.dataset[attribute] === cardId
    );
};

/**
 * Where the focus goes when a stage dialog closes. The dialogs open without a trigger
 * element, and the control that opened them often unmounts (the menu item, or the card's
 * buttons once a run starts), so the focus falls back along the card: its menu, its run
 * buttons, then its title link.
 */
export function restoreRunDialogFocus(
    cardId: string,
    opener: Element | null,
    root: ParentNode = document
): void {
    if (
        opener instanceof HTMLElement &&
        opener.isConnected &&
        opener !== opener.ownerDocument.body
    ) {
        opener.focus();
        // A closed antd dropdown keeps its items in the page, hidden, so focusing the
        // item that opened the dialog can silently do nothing.
        if (opener.ownerDocument.activeElement === opener) {
            return;
        }
    }
    const target =
        byCard(root, "cardMenu", cardId)?.querySelector<HTMLElement>(
            "button"
        ) ??
        byCard(root, "runControls", cardId)?.querySelector<HTMLElement>(
            "button"
        ) ??
        byCard(root, "cardLink", cardId);
    target?.focus();
}
