import { z } from "zod";

// GitHub logins have 1 to 39 characters: letters, digits and single hyphens, never at either end.
const GITHUB_LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
const GITHUB_ID = /^\d+$/;
const HTTP_PROTOCOL = /^https?$/;

export const githubLoginSchema = z.string().regex(GITHUB_LOGIN);

/**
 * The GitHub account behind a board user. `id` is the stable key; `login` can change on
 * GitHub and is rewritten on every sign-in.
 */
export const githubIdentitySchema = z.object({
    id: z.string().regex(GITHUB_ID),
    login: githubLoginSchema,
    name: z.string().min(1).nullable(),
    avatarUrl: z.url({ protocol: HTTP_PROTOCOL }).nullable(),
});

export type GithubIdentity = z.infer<typeof githubIdentitySchema>;
