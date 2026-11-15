/**
 * URL scheme. Paths follow the upstream client so existing links keep their
 * shape: app screens live under "/~/", profiles at "/:username", and casts
 * at "/:username/:hash".
 *
 * Cast links carry the full hash rather than the short share form: a node
 * can look up a full hash directly, while a short one has to be searched for.
 */
import type { Cast, CastHash, Fid, User } from '~/hypersnap/types';

type ProfileTab = 'casts' | 'replies' | 'likes';
type SearchTab = 'casts' | 'users' | 'channels';
type ReactionTab = 'likes' | 'recasts' | 'quotes';

const PROFILE_TAB_SEGMENT: Record<ProfileTab, string> = {
  casts: '',
  replies: '/casts-and-replies',
  likes: '/likes',
};

const SEARCH_TAB_SEGMENT: Record<SearchTab, string> = {
  casts: 'recent',
  users: 'users',
  channels: 'channels',
};

const REACTION_TAB_SEGMENT: Record<ReactionTab, string> = {
  likes: 'reactions',
  recasts: 'recasts',
  quotes: 'quotes',
};

type UserRef = Pick<User, 'fid' | 'username'>;

const profileBase = (user: UserRef) =>
  user.username !== ''
    ? `/${encodeURIComponent(user.username)}`
    : `/~/profiles/${user.fid}`;

const castBase = (cast: Pick<Cast, 'hash' | 'author'>) =>
  cast.author.username !== ''
    ? `/${encodeURIComponent(cast.author.username)}/${cast.hash}`
    : `/~/conversations/${cast.hash}`;

const paths = {
  home: () => '/',
  following: () => '/~/following',
  notifications: () => '/~/notifications',
  bookmarks: () => '/~/bookmarks',
  explore: () => '/~/explore/channels',
  exploreUsers: () => '/~/explore/users',
  settings: () => '/~/settings',
  about: () => '/~/about',

  search: (tab: SearchTab, query: string) =>
    `/~/search/${SEARCH_TAB_SEGMENT[tab]}${
      query === '' ? '' : `?q=${encodeURIComponent(query)}`
    }`,

  channel: (channelId: string) => `/~/channel/${encodeURIComponent(channelId)}`,
  channelMembers: (channelId: string) =>
    `/~/channel/${encodeURIComponent(channelId)}/members`,

  profile: (user: UserRef, tab: ProfileTab = 'casts') =>
    `${profileBase(user)}${PROFILE_TAB_SEGMENT[tab]}`,
  profileByFid: (fid: Fid) => `/~/profiles/${fid}`,
  followers: (user: UserRef) => `${profileBase(user)}/followers`,
  followingList: (user: UserRef) => `${profileBase(user)}/following`,

  cast: castBase,
  castByHash: (hash: CastHash) => `/~/conversations/${hash}`,
  castReactions: (cast: Pick<Cast, 'hash' | 'author'>, tab: ReactionTab) =>
    `${castBase(cast)}/${REACTION_TAB_SEGMENT[tab]}`,
};

export { paths, PROFILE_TAB_SEGMENT, REACTION_TAB_SEGMENT, SEARCH_TAB_SEGMENT };
export type { ProfileTab, ReactionTab, SearchTab };
