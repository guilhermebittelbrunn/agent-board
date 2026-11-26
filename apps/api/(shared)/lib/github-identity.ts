import {
    type GithubIdentity,
    githubIdentitySchema,
} from "@repo/kanban-contract";
import type { DecodedIdToken } from "firebase-admin/auth";
import { identityLookupProvider } from "./firebase-identity-toolkit";

export const GITHUB_PROVIDER_ID = "github.com";

export const signedInWithGithub = (claims: DecodedIdToken): boolean =>
    claims.firebase?.sign_in_provider === GITHUB_PROVIDER_ID;

/**
 * The login decides repository permissions later, so it comes from Firebase and never
 * from the request. The id in the verified token has to match the one Firebase returns,
 * which ties the looked-up account to the token that was checked.
 */
export async function readGithubIdentity(
    idToken: string,
    claims: DecodedIdToken
): Promise<GithubIdentity | null> {
    const claimedId: unknown =
        claims.firebase?.identities?.[GITHUB_PROVIDER_ID]?.[0];
    const info = await identityLookupProvider(idToken, GITHUB_PROVIDER_ID);
    if (!(info?.rawId && claimedId) || info.rawId !== String(claimedId)) {
        return null;
    }
    const parsed = githubIdentitySchema.safeParse({
        id: info.rawId,
        login: info.screenName,
        name: info.displayName || null,
        avatarUrl: info.photoUrl || null,
    });
    return parsed.success ? parsed.data : null;
}
