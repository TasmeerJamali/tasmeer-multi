# Testing Strategy

## Test Tiers
1. **Unit Tests**: Pure logic tests for configuration parsing and state transitions.
2. **IPC Integration Tests**: Headless Electron mock harness testing renderer-to-main messaging.
3. **Smoke Tests**: Launch, partition spawn, and clean exit checks.
