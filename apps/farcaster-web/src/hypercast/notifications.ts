/**
 * The node returns one notification row per actor. Fold them into the
 * groups people expect: "A, B and 3 others liked this cast".
 */
import type { Cast, NotificationItem, User } from '~/hypersnap/types';

type NotificationGroup =
  | {
      kind: 'reaction';
      reaction: 'like' | 'recast';
      key: string;
      cast: Cast;
      actors: User[];
      timestampMs: number | null;
    }
  | { kind: 'follow'; key: string; actors: User[]; timestampMs: number | null }
  | {
      kind: 'cast';
      label: 'reply' | 'mention' | 'quote';
      key: string;
      cast: Cast;
      timestampMs: number | null;
    }
  | { kind: 'other'; key: string; actor: User; timestampMs: number | null };

function pushUnique(actors: User[], actor: User): void {
  if (!actors.some((existing) => existing.fid === actor.fid)) {
    actors.push(actor);
  }
}

function groupNotifications(items: NotificationItem[]): NotificationGroup[] {
  const groups: NotificationGroup[] = [];
  const reactionGroups = new Map<
    string,
    Extract<NotificationGroup, { kind: 'reaction' }>
  >();

  for (const item of items) {
    if ((item.kind === 'like' || item.kind === 'recast') && item.cast) {
      // Every like of one cast collapses into the group's first appearance.
      const key = `${item.kind}:${item.cast.hash}`;
      const existing = reactionGroups.get(key);
      if (existing) {
        pushUnique(existing.actors, item.actor);
      } else {
        const group = {
          kind: 'reaction' as const,
          reaction: item.kind,
          key,
          cast: item.cast,
          actors: [item.actor],
          timestampMs: item.timestampMs,
        };
        reactionGroups.set(key, group);
        groups.push(group);
      }
      continue;
    }

    if (item.kind === 'follow') {
      // Only consecutive follows merge, so the list stays chronological.
      const previous = groups[groups.length - 1];
      if (previous?.kind === 'follow') {
        pushUnique(previous.actors, item.actor);
      } else {
        groups.push({
          kind: 'follow',
          key: `follow:${item.actor.fid}:${item.timestamp ?? groups.length}`,
          actors: [item.actor],
          timestampMs: item.timestampMs,
        });
      }
      continue;
    }

    if (
      (item.kind === 'reply' ||
        item.kind === 'mention' ||
        item.kind === 'quote') &&
      item.cast
    ) {
      groups.push({
        kind: 'cast',
        label: item.kind,
        key: `${item.kind}:${item.cast.hash}`,
        cast: item.cast,
        timestampMs: item.timestampMs,
      });
      continue;
    }

    groups.push({
      kind: 'other',
      key: `other:${item.actor.fid}:${item.timestamp ?? groups.length}`,
      actor: item.actor,
      timestampMs: item.timestampMs,
    });
  }

  return groups;
}

export { groupNotifications };
export type { NotificationGroup };
