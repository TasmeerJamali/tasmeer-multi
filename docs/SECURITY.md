# Security Model

## Threat Model & Protections
1. **Credential Isolation**: Each browser session runs in an isolated `persist:` partition. Credentials and session tokens never cross partition barriers.
2. **Network Security**: Strict Content Security Policy (CSP) enforcement on local renderer views.
3. **IPC Validation**: All IPC messages are validated with strict schema checking before execution in the main process.
