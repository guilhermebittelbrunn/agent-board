import { getAuthInstance, getCurrentUser } from "@repo/auth/server";
import {
    type GithubIdentity,
    githubIdentitySchema,
} from "@repo/kanban-contract";
import type { UserDTO } from "@repo/sdk/src/types";
import { logEvent } from "@repo/shared/utils/helpers/log";
import type { UserRecord } from "firebase-admin/auth";
import { mergeAuthAndFirestore } from "../mappers/user.mapper";
import { userRepository } from "../repositories/user.repository";
import { revokeAccountAccess } from "./account-access";
import { adminAuthErrorReason } from "./toolkit-error-codes";

export const USER_COLLECTION = "user";

export async function getMergedUserByUid(
    uid: string
): Promise<Record<string, unknown> | null> {
    const authInstance = getAuthInstance();
    let userRecord: UserRecord;
    try {
        userRecord = await authInstance.getUser(uid);
    } catch {
        return null;
    }
    const profile = await findOrCreateProfile(uid);
    if (!profile) {
        return null;
    }

    return mergeAuthAndFirestore(userRecord, profile);
}

export async function getMergedUserFromIdToken(
    idToken: string | null
): Promise<Record<string, unknown> | null> {
    if (!idToken) {
        return null;
    }
    const authUser = await getCurrentUser(idToken);
    if (!authUser) {
        return null;
    }
    const profile = await findOrCreateProfile(authUser.uid);
    if (!profile) {
        return null;
    }

    return mergeAuthAndFirestore(authUser, profile);
}

/**
 * An archived profile means this account's access was taken away: signing in again
 * must not hand it a fresh profile. Accounts archived while still enabled in Firebase
 * Auth are disabled here, on their first contact; a failure is retried on the next one.
 */
async function findOrCreateProfile(uid: string): Promise<UserDTO | null> {
    const profile = await userRepository.findByReferenceId(uid);
    if (profile) {
        return profile;
    }

    if (await userRepository.hasArchivedProfile(uid)) {
        await revokeAccountAccess(uid).catch((error: unknown) =>
            logEvent("auth", "archived-account-lockout-failed", {
                reason: adminAuthErrorReason(error),
            })
        );
        return null;
    }

    return createDefaultUserProfile(uid);
}

export function createDefaultUserProfile(
    uid: string,
    dto?: Partial<UserDTO>
): Promise<UserDTO> {
    return userRepository.create({ reference_id: uid, ...dto });
}

export async function getMergedUserByFirestoreDocId(
    firestoreDocId: string
): Promise<Record<string, unknown> | null> {
    const profile = await userRepository.findById(firestoreDocId);
    if (!profile) {
        return null;
    }
    return getMergedUserByUid(profile.reference_id);
}

function isSameGithubIdentity(stored: unknown, next: GithubIdentity): boolean {
    const parsed = githubIdentitySchema.safeParse(stored);
    if (!parsed.success) {
        return false;
    }
    const current = parsed.data;
    return (
        current.id === next.id &&
        current.login === next.login &&
        current.name === next.name &&
        current.avatarUrl === next.avatarUrl
    );
}

/** Writes only on change: `update` stamps `updatedAt`, and most sign-ins change nothing. */
export async function syncGithubIdentity(
    profileId: string,
    stored: unknown,
    next: GithubIdentity
): Promise<void> {
    if (isSameGithubIdentity(stored, next)) {
        return;
    }
    await userRepository.update({ id: profileId, github: next });
}
