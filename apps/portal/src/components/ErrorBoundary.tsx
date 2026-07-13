import { Component, type ReactNode } from "react";
import { View } from "react-native";

import { Button, IconCircle, Screen, Text } from "./ui";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * Catches render errors below it and shows a themed recovery screen instead of
 * a white crash. Placed inside the theme/safe-area providers so the fallback is
 * styled correctly.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Hook for a crash reporter (Sentry, etc.) later.
    if (__DEV__) console.error("Uncaught UI error:", error);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <Screen contentClassName="flex-1 items-center justify-center gap-4">
        <IconCircle name="warning-outline" tone="danger" size={64} />
        <View className="items-center gap-1.5">
          <Text variant="h2" align="center">
            Something went wrong
          </Text>
          <Text variant="body" color="secondary" align="center">
            The screen hit an unexpected error. Try again.
          </Text>
        </View>
        <Button
          label="Try again"
          variant="primary"
          leftIcon="refresh"
          onPress={this.reset}
        />
      </Screen>
    );
  }
}
