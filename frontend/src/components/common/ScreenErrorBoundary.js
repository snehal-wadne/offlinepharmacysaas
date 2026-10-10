import React from "react";
import { View, Text, Pressable, ScrollView } from "react-native";

/**
 * Catches a crash inside one screen and shows what went wrong, instead of leaving the user
 * on a blank page. Resets automatically when the route changes.
 */
export default class ScreenErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[ScreenErrorBoundary]", this.props.routeName, error, info?.componentStack);
  }

  componentDidUpdate(prev) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const stack = String(error?.stack || "").split(String.fromCharCode(10)).slice(0, 6).join(String.fromCharCode(10));
    return (
      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <View
          style={{
            backgroundColor: "#FFF5F5",
            borderWidth: 1,
            borderColor: "#F2C4C4",
            borderRadius: 12,
            padding: 20,
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: "800", color: "#B85C64", marginBottom: 6 }}>
            This page hit an error
          </Text>
          <Text style={{ fontSize: 14, color: "#28242B", marginBottom: 12 }}>
            {String(error?.message || error)}
          </Text>
          <Text selectable style={{ fontSize: 11, color: "#77717A", marginBottom: 16 }}>
            {stack}
          </Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={() => this.setState({ error: null })}
              style={{ backgroundColor: "#B9829A", paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 }}
            >
              <Text style={{ color: "#fff", fontWeight: "700" }}>Try again</Text>
            </Pressable>
            {this.props.onGoHome ? (
              <Pressable
                onPress={this.props.onGoHome}
                style={{ borderWidth: 1, borderColor: "#E5DFE4", paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 }}
              >
                <Text style={{ color: "#28242B", fontWeight: "700" }}>Back to dashboard</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </ScrollView>
    );
  }
}
