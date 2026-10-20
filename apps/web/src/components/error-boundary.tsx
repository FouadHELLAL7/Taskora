import { Component, type ReactNode } from 'react';
import { Button } from './ui/button';
import { EmptyState } from './ui/misc';

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override componentDidCatch(error: Error) {
    console.error(error);
  }
  override render() {
    if (this.state.error) {
      return (
        <EmptyState
          title="This page failed to load"
          description={this.state.error.message}
          action={<Button onClick={() => this.setState({ error: null })}>Try again</Button>}
        />
      );
    }
    return this.props.children;
  }
}
