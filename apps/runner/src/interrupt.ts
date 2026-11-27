/**
 * Under `pnpm cli start`, one Ctrl+C reaches the runner twice within a millisecond: once from
 * the terminal, which signals the whole foreground group, and once forwarded by pnpm. A second
 * signal this close to the first is the same key press, not a request to quit at once.
 */
export const DUPLICATE_SIGNAL_MS = 1000;

export type InterruptHandlers = {
    /** First Ctrl+C: stop polling and let the run in progress report as interrupted. */
    onFirst: () => void;
    /** Ctrl+C pressed again: leave now. */
    onForce: () => void;
    now?: () => number;
};

export function createInterruptHandler(handlers: InterruptHandlers) {
    const now = handlers.now ?? Date.now;
    let firstAt: number | null = null;
    return () => {
        const at = now();
        if (firstAt === null) {
            firstAt = at;
            handlers.onFirst();
            return;
        }
        if (at - firstAt < DUPLICATE_SIGNAL_MS) {
            return;
        }
        handlers.onForce();
    };
}
