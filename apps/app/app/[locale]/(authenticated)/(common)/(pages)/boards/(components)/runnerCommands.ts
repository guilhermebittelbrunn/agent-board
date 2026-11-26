/**
 * The two commands the person runs on the machine. The CLI lives in this repository's
 * `apps/runner` until it is published, so it runs through pnpm from a checkout.
 */
export function runnerCommands(code: string, apiUrl: string) {
    return {
        register: `pnpm --filter runner cli register ${code} --api ${apiUrl}`,
        start: "pnpm --filter runner cli start",
    };
}
