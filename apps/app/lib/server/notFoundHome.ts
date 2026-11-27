import { getAppSessionUser } from "@/lib/server/authSession";
import { withLocalePath } from "@/shared/lib/localePath";

/** Home link for 404: the boards with a session, the landing without one. */
export async function resolveNotFoundHomePath(locale: string): Promise<string> {
    const user = await getAppSessionUser();
    return withLocalePath(locale, user ? "/boards" : "/");
}
