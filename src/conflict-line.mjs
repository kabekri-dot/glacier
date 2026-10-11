// The line under the pill about notes with two versions (#70). It can be
// closed with ×, and then stays away until a new conflict happens, which is
// when the count grows past what it was when closed. The sync dot stays
// orange regardless. Pure, no screen code.
import { conflictMessage } from "./auto-sync.mjs";

export function createConflictLine() {
  let closedAt = 0;

  return {
    text: conflictMessage,
    // Whether to show the line for this many notes with two versions. Fewer
    // than when it was closed lowers the mark, so a later new conflict counts.
    shown(count) {
      closedAt = Math.min(closedAt, count);
      return count > closedAt;
    },
    close(count) {
      closedAt = count;
    },
  };
}
