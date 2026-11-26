import {
    installationRepositoriesEventSchema,
    memberEventSchema,
} from "@/(shared)/validation/github-webhook.schema";
import {
    type GithubPermissionCache,
    githubPermissionCache,
} from "./github-permission-cache";

export type WebhookEventOutcome =
    | { invalid: false; handled: boolean; action: string | undefined }
    | { invalid: true };

const actionOf = (payload: unknown): string | undefined =>
    payload !== null &&
    typeof payload === "object" &&
    "action" in payload &&
    typeof payload.action === "string"
        ? payload.action
        : undefined;

/**
 * Only changes of who can reach a repository matter here: a collaborator added or
 * removed, or the installation gaining or losing a repository. Both drop the cached
 * permissions of that repository so the next check asks GitHub again.
 */
export function applyWebhookEvent(
    event: string,
    payload: unknown,
    cache: GithubPermissionCache = githubPermissionCache
): WebhookEventOutcome {
    switch (event) {
        case "member": {
            const parsed = memberEventSchema.safeParse(payload);
            if (!parsed.success) {
                return { invalid: true };
            }
            cache.invalidateRepository(parsed.data.repository.full_name);
            return {
                invalid: false,
                handled: true,
                action: parsed.data.action,
            };
        }
        case "installation_repositories": {
            const parsed =
                installationRepositoriesEventSchema.safeParse(payload);
            if (!parsed.success) {
                return { invalid: true };
            }
            for (const repository of [
                ...parsed.data.repositories_added,
                ...parsed.data.repositories_removed,
            ]) {
                cache.invalidateRepository(repository.full_name);
            }
            return {
                invalid: false,
                handled: true,
                action: parsed.data.action,
            };
        }
        default:
            return {
                invalid: false,
                handled: false,
                action: actionOf(payload),
            };
    }
}
