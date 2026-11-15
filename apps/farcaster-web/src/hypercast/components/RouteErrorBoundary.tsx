import { Component, ErrorInfo, ReactNode } from 'react';

import { DefaultButton } from '~/components/forms/buttons/DefaultButton';

type Props = {
  children: ReactNode;
  /** Changing this clears a caught error, e.g. on navigation. */
  resetKey: string;
};

type State = { error: Error | null; resetKey: string };

/**
 * Catches a crash in one screen so the navigation stays usable. Nothing is
 * reported anywhere: the error goes to the browser console only.
 */
class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(
    props: Props,
    state: State,
  ): Partial<State> | null {
    if (props.resetKey !== state.resetKey) {
      return { error: null, resetKey: props.resetKey };
    }
    return null;
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('Screen failed to render', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error === null) {
      return this.props.children;
    }
    return (
      <div
        role="alert"
        className="flex min-h-screen flex-col items-center px-6 pt-24 text-center border-surface-secondary sm:border-x"
      >
        <div className="text-lg font-semibold text-default">
          This screen hit a problem
        </div>
        <div className="max-w-[420px] pt-1 text-sm text-muted">
          Something in the page failed while it was being drawn. Your data is
          untouched; reloading usually fixes it.
        </div>
        <DefaultButton
          className="mt-4"
          onClick={() => window.location.reload()}
        >
          Reload
        </DefaultButton>
      </div>
    );
  }
}

export { RouteErrorBoundary };
