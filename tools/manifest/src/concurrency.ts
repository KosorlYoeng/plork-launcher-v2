/**
 * Maps `items` through `fn` with at most `limit` concurrent in-flight
 * calls — caps concurrently open file handles/streams so bulk file
 * operations (hashing, copying) don't hit the OS file-descriptor limit
 * (EMFILE) on a large build with many files.
 */
export async function mapWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await fn(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}
