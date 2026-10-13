// Run `work` on every item, at most `limit` at once, and resolve when all are
// done. A Notes Home answers several requests side by side, which is much
// faster than one after the other, but a browser that sends too many at once
// gets slowed down. The first failure stops starting new items and is thrown.
export async function fewAtATime(items, work, limit = 6) {
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < items.length) {
      const at = next++;
      try {
        await work(items[at], at);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
