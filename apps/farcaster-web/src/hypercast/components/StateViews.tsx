import { FC, memo, ReactNode } from 'react';

import { DefaultButton } from '~/components/forms/buttons/DefaultButton';
import { LoadingIndicator } from '~/components/loaders/LoadingIndicator';
import { config } from '~/hypersnap/config';
import { isHypersnapError } from '~/hypersnap/errors';

const LoadingView: FC<{ label?: string }> = memo(({ label = 'Loading' }) => (
  <div
    className="flex w-full flex-col items-center justify-start px-4 py-12"
    aria-busy="true"
    aria-label={label}
  >
    <LoadingIndicator />
  </div>
));
LoadingView.displayName = 'LoadingView';

type Described = { title: string; detail: string; canRetry: boolean };

/** Turns a failure into words a person can act on. */
function describeError(error: unknown, subject: string): Described {
  if (!isHypersnapError(error)) {
    return {
      title: 'Something went wrong',
      detail: 'This part of the page failed to load.',
      canRetry: true,
    };
  }

  switch (error.kind) {
    case 'not_found':
      return {
        title: `${subject} not found on this Hypersnap node`,
        detail: `${config.nodeLabel} has no record of it. It may exist on another network or node.`,
        canRetry: false,
      };
    case 'network':
      return {
        title: 'Can’t reach the node',
        detail: `No response from ${config.nodeLabel}. Check your connection and try again.`,
        canRetry: true,
      };
    case 'timeout':
      return {
        title: 'The node is taking too long',
        detail: `${config.nodeLabel} did not answer in time.`,
        canRetry: true,
      };
    case 'rate_limited':
      return {
        title: 'Too many requests',
        detail: `${config.nodeLabel} is limiting requests right now. Wait a moment and try again.`,
        canRetry: true,
      };
    case 'server':
      return {
        title: 'The node had a problem',
        detail: `${config.nodeLabel} returned an error${
          error.status ? ` (${error.status})` : ''
        }. This is on the node’s side.`,
        canRetry: true,
      };
    case 'malformed':
      return {
        title: 'Unexpected response',
        detail: `${config.nodeLabel} answered in a format this version of ${config.appName} does not understand.`,
        canRetry: true,
      };
    case 'bad_request':
      return {
        title: 'The node rejected the request',
        detail: error.message,
        canRetry: false,
      };
    default:
      return {
        title: 'Something went wrong',
        detail: error.message,
        canRetry: true,
      };
  }
}

type ErrorViewProps = {
  error: unknown;
  /** What was being loaded, capitalised: "Cast", "Profile", "Feed". */
  subject?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
};

const ErrorView: FC<ErrorViewProps> = memo(
  ({ error, subject = 'This', onRetry, isRetrying = false }) => {
    const { title, detail, canRetry } = describeError(error, subject);
    return (
      <div
        role="alert"
        className="flex flex-col items-center px-6 py-12 text-center bg-app"
      >
        <div className="text-base font-semibold text-default">{title}</div>
        <div className="max-w-[420px] pt-1 text-sm text-muted">{detail}</div>
        {canRetry && onRetry && (
          <DefaultButton
            variant="secondary"
            className="mt-4"
            onClick={onRetry}
            isLoading={isRetrying}
          >
            Try again
          </DefaultButton>
        )}
      </div>
    );
  },
);
ErrorView.displayName = 'ErrorView';

type EmptyViewProps = {
  message: string;
  subMessage?: string;
  children?: ReactNode;
};

const EmptyView: FC<EmptyViewProps> = memo(
  ({ message, subMessage, children }) => (
    <div className="p-4 py-12 text-center bg-app">
      <div className="text-base text-default">{message}</div>
      {subMessage && (
        <div className="pt-1 text-sm text-muted">{subMessage}</div>
      )}
      {children && <div className="flex justify-center pt-4">{children}</div>}
    </div>
  ),
);
EmptyView.displayName = 'EmptyView';

export { describeError, EmptyView, ErrorView, LoadingView };
