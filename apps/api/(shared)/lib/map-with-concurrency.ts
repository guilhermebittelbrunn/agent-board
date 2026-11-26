/** Runs `run` over every item with at most `limit` calls in flight, keeping the input order. */
export async function mapWithConcurrency<T, R>(
    items: readonly T[],
    limit: number,
    run: (item: T) => Promise<R>
): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let next = 0;
    const worker = async () => {
        while (next < items.length) {
            const index = next++;
            results[index] = await run(items[index] as T);
        }
    };
    await Promise.all(
        Array.from({ length: Math.min(limit, items.length) }, worker)
    );
    return results;
}
