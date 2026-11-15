/**
 * The interface's single door to anything that changes network state.
 *
 * Components ask this context whether an action is available and call it;
 * they never build or send messages themselves. The default value is the
 * read-only controller, so a build without writes has no path from a
 * button to the network at all.
 */
import { createContext, useContext } from 'react';

import {
  type Capabilities,
  getCapabilities,
  READ_ONLY_EXPLANATION,
} from '~/hypersnap/capabilities';
import type { Cast, Channel, Fid, User } from '~/hypersnap/types';

type Engagement = {
  liked: boolean;
  recasted: boolean;
  likesCount: number;
  recastsCount: number;
  /** A signed message for this cast is on its way to the node. */
  pending: boolean;
};

type FollowState = {
  following: boolean;
  pending: boolean;
};

type ComposerTarget = {
  parent?: Cast;
  channel?: Channel;
};

type WriteController = {
  capabilities: Capabilities;
  /** Shown on controls that cannot be used right now. */
  unavailableReason: string;
  signedInFid: Fid | null;
  requestSignIn: () => void;
  requestSignOut: () => void;
  toggleLike: (cast: Cast) => void;
  toggleRecast: (cast: Cast) => void;
  toggleFollow: (user: User) => void;
  openComposer: (target?: ComposerTarget) => void;
  deleteCast: (cast: Cast) => void;
  engagementOf: (cast: Cast) => Engagement;
  /** null when the viewer's relationship to this user is not known. */
  followStateOf: (user: User) => FollowState | null;
  isDeleted: (cast: Cast) => boolean;
};

const noop = () => undefined;

const readOnlyController: WriteController = {
  capabilities: getCapabilities({ writesEnabled: false }, { mode: 'guest' }),
  unavailableReason: READ_ONLY_EXPLANATION,
  signedInFid: null,
  requestSignIn: noop,
  requestSignOut: noop,
  toggleLike: noop,
  toggleRecast: noop,
  toggleFollow: noop,
  openComposer: noop,
  deleteCast: noop,
  engagementOf: (cast) => ({
    // Counts are the network's. Nobody is signed in, so nothing is "yours".
    liked: false,
    recasted: false,
    likesCount: cast.likesCount,
    recastsCount: cast.recastsCount,
    pending: false,
  }),
  followStateOf: () => null,
  isDeleted: () => false,
};

const WriteContext = createContext<WriteController>(readOnlyController);

const useWrites = (): WriteController => useContext(WriteContext);

export { readOnlyController, useWrites, WriteContext };
export type { ComposerTarget, Engagement, FollowState, WriteController };
