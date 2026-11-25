export const accountTabValues = ["profile", "security", "preferences"] as const;

export type AccountTabValue = (typeof accountTabValues)[number];

export const resolveAccountTab = (raw: string | null): AccountTabValue =>
    (accountTabValues as readonly string[]).includes(raw ?? "")
        ? (raw as AccountTabValue)
        : "profile";

export const accountTabHref = (
    pathname: string,
    searchParams: Pick<URLSearchParams, "toString">,
    tab: AccountTabValue
): string => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    return `${pathname}?${params.toString()}`;
};
