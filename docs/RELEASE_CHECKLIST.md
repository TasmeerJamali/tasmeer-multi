# Release Verification Checklist

## Pre-Release Checks
1. Verify clean git working directory.
2. Run `npm run build` and verify zero bundle errors.
3. Package Windows executable via `npm run dist`.
4. Verify code signing and checksum generation.
5. Draft GitHub release notes with full changelog.
