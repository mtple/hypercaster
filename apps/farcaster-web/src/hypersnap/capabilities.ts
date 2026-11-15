/**
 * What the current build and session are allowed to do.
 *
 * With writes disabled every flag is false and the write module is never
 * loaded. With writes enabled, actions still require a signed-in account;
 * until then `canSignIn` is the only thing that is true.
 */
import type { HypersnapConfig } from '~/hypersnap/config';
import type { Session } from '~/hypersnap/session';

type Capabilities = {
  canSignIn: boolean;
  canPost: boolean;
  canReply: boolean;
  canLike: boolean;
  canRecast: boolean;
  canFollow: boolean;
  canDeleteOwnCast: boolean;
  /** Not implemented in any configuration. */
  canEditProfile: false;
  canUploadMedia: false;
  canMarkNotificationsSeenRemotely: false;
};

const READ_ONLY_EXPLANATION = 'Read-only preview — posting will be added later';
const SIGN_IN_EXPLANATION = 'Sign in to do this';

function getCapabilities(
  config: Pick<HypersnapConfig, 'writesEnabled'>,
  session: Session,
): Capabilities {
  const signedIn = config.writesEnabled && session.mode === 'signedIn';
  return {
    canSignIn: config.writesEnabled && !signedIn,
    canPost: signedIn,
    canReply: signedIn,
    canLike: signedIn,
    canRecast: signedIn,
    canFollow: signedIn,
    canDeleteOwnCast: signedIn,
    canEditProfile: false,
    canUploadMedia: false,
    canMarkNotificationsSeenRemotely: false,
  };
}

/** Why a write control is unavailable, for tooltips and aria labels. */
function unavailableReason(
  config: Pick<HypersnapConfig, 'writesEnabled'>,
): string {
  return config.writesEnabled ? SIGN_IN_EXPLANATION : READ_ONLY_EXPLANATION;
}

export {
  getCapabilities,
  READ_ONLY_EXPLANATION,
  SIGN_IN_EXPLANATION,
  unavailableReason,
};
export type { Capabilities };
