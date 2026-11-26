# Multi-Account Architecture

## Overview
Tasmeer Multi runs dedicated Electron webContents partitions for each authenticated provider session, preventing cookie and local storage collisions across simultaneous AI accounts.

## Process Isolation
- **Main Process**: Manages application window lifecycle, global system tray integration, and native accelerator hooks.
- **Renderer Processes**: Isolated per chat container with contextIsolation enabled and Node.js integration disabled.
- **Preload Scripts**: Expose typed, minimal IPC channels for window controls and session status.
