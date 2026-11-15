type WireUser = Record<string, unknown> & { fid: number | string; username: string };
type WireCast = Record<string, unknown> & {
  hash: string;
  author: WireUser;
  text: string;
  thread_hash: string;
  parent_hash?: string;
};

export type World = {
  now: number;
  handle: (
    pathname: string,
    query: URLSearchParams,
  ) => { status: number; body: unknown; text?: string };
  hashOf: (n: number) => string;
  users: Record<
    'ada' | 'ben' | 'chiyo' | 'devon' | 'esme' | 'farid' | 'gus' | 'hana' | 'nova' | 'anon',
    WireUser
  > & { fillers: WireUser[] };
  casts: Record<
    | 'launch'
    | 'coast'
    | 'walk'
    | 'essay'
    | 'quoting'
    | 'nativeHello'
    | 'noAvatar'
    | 'clip'
    | 'stream'
    | 'anonCast'
    | 'links'
    | 'gm'
    | 'unsafe'
    | 'reply1'
    | 'reply1a'
    | 'reply1a1'
    | 'reply2'
    | 'reply3'
    | 'orphan',
    WireCast
  > & { fillerCasts: WireCast[] };
  missingParentHash: string;
  channels: Record<string, unknown>[];
};

export function createWorld(options?: { mediaBase?: string; now?: number }): World;
