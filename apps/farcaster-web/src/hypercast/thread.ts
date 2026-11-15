/**
 * Lays a reply tree out as the rows of a conversation page.
 *
 * A thread is drawn as a single line through avatars, which cannot show
 * branching. So each top-level reply is followed down its first reply
 * only, and anything left out is counted and linked rather than dropped.
 */
import type { ThreadPosition } from '~/hypercast/components/Threadline';
import type { Cast, ConversationNode } from '~/hypersnap/types';

type ThreadRow = {
  cast: Cast;
  threadPosition: ThreadPosition;
  /** Replies to this cast that are not shown on this page. */
  hiddenReplies: number;
};

function chainOf(node: ConversationNode): ConversationNode[] {
  const chain = [node];
  let current = node;
  while (current.replies.length > 0) {
    current = current.replies[0];
    chain.push(current);
  }
  return chain;
}

function threadRows(topLevelReply: ConversationNode): ThreadRow[] {
  const chain = chainOf(topLevelReply);
  return chain.map((node, index) => {
    const isLast = index === chain.length - 1;
    const shown = isLast ? 0 : 1;
    return {
      cast: node.cast,
      threadPosition:
        chain.length === 1
          ? 'none'
          : index === 0
            ? 'start'
            : isLast
              ? 'end'
              : 'middle',
      // Whatever the node reports beyond the one reply drawn beneath it:
      // siblings of that reply, or replies deeper than the page fetched.
      hiddenReplies: Math.max(
        0,
        Math.max(node.cast.repliesCount, node.replies.length) - shown,
      ),
    };
  });
}

export { threadRows };
export type { ThreadRow };
