const encodeSegments = (value: string) =>
    value.split("/").map(encodeURIComponent).join("/");

export function githubFileUrl(
    owner: string,
    name: string,
    ref: string,
    path: string
): string {
    return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/blob/${encodeSegments(ref)}/${encodeSegments(path)}`;
}
