# Discord Quest Automation Tool

A lightweight automation and injection utility designed to automate Discord desktop quests, including concurrent game activity spoofing, automated video quest progression, and immediate reward claiming.

---

## Overview

The repository provides two execution methods:
1. **Automated Core Injection (`discord_injector.py`)**: Patches Discord's desktop core (`discord_desktop_core`) to automatically run the completion script on Discord launch.
2. **Manual DevTools Execution (`discord_quest_completer.js`)**: Can be pasted directly into Discord's DevTools console without modifying disk files.

---

## Features

- **Multi-Task Support**: Handles `PLAY_ON_DESKTOP`, `WATCH_VIDEO`, `WATCH_VIDEO_ON_MOBILE`, and `STREAM_ON_DESKTOP`.
- **Auto-Enrollment**: Automatically queries active, uncompleted quests from `QuestsStore` and enrolls the user.
- **Concurrent Play Emulation**: Intercepts Discord's internal `RunningGameStore` and dispatches `RUNNING_GAMES_CHANGE` events, allowing all desktop play quests to progress simultaneously.
- **Video Quest Progressing**: Periodically pushes video progress packets directly through Discord's internal API client until completion.
- **Automatic Reward Claims**: Immediately triggers the reward claiming endpoint (`/quests/{id}/claim-reward`) once a quest objective is met.
- **State Restoration**: Restores genuine process tracking hooks in `RunningGameStore` once all active quests are completed.
- **Safe Patching & Rollback**: Backs up original `index.js` files (`index.js.bak`) prior to modification and provides an uninstaller command.

---

## Repository Structure

```
├── discord_injector.py         # Automated core installer and uninstaller
├── discord_quest_completer.js  # Client-side Discord automation script
└── README.md                   # Technical documentation
```

---

## Prerequisites

- **Operating System**: Windows 10 / 11
- **Discord Desktop Client**: Standard installed desktop client (PTB/Canary may require path adjustments)
- **Python**: 3.8 or higher (for `discord_injector.py`)

---

## Usage

### Method 1: Automated Injection (Persistent)

This method patches the Discord desktop bootstrap loader (`discord_desktop_core/index.js`) to execute the quest runner 6 seconds after client startup.

> [!IMPORTANT]
> **Discord must be completely closed.**
> The script modifies the Electron main process bootstrap script. A window refresh (`Ctrl + R`) is **not** sufficient, as `index.js` executes only when Discord launches initially from scratch. The installer automatically terminates running `Discord.exe` processes before patching. Ensure Discord is relaunched afterward.

#### 1. Installation
Run the installer script:
```bash
python discord_injector.py
```
Or with the Windows Python launcher:
```bash
py discord_injector.py
```

Launch Discord normally once the installer finishes.

#### 2. Uninstallation / Rollback
To restore Discord to its pristine, unmodified state:
```bash
python discord_injector.py uninstall
```
*(Accepts `uninstall`, `remove`, or `-u`)*

Relaunch Discord after rollback.

---

### Method 2: Manual Console Execution (Non-Persistent)

If you prefer not to modify Discord client files on disk:

1. Open Discord Desktop.
2. Open Developer Tools using `Ctrl + Shift + I`.
   > **Note**: If Developer Tools are disabled in your Discord build, enable them via Discord settings or settings.json configuration.
3. Navigate to the **Console** tab.
4. Copy the entire contents of [`discord_quest_completer.js`](discord_quest_completer.js).
5. Paste into the console and press `Enter`.
6. Monitor the console logs for task enrollment, heartbeat progress, and reward claims.

---

## How It Works

1. **Webpack Traversal**: Extracts internal instances of `RunningGameStore`, `QuestsStore`, `FluxDispatcher`, and the authenticated `api` module directly from `webpackChunkdiscord_app`.
2. **Quest Discovery**: Evaluates all non-expired entries in `QuestsStore.quests` against currently supported task types.
3. **Application Metadata Resolution**: Resolves process executable names and application IDs via Discord's `/applications/public` endpoint to construct valid process descriptors.
4. **Dispatcher Emulation**: Overrides `RunningGameStore.getRunningGames` and triggers `RUNNING_GAMES_CHANGE` to emulate active gameplay without launching external binaries.
5. **Heartbeat Tracking**: Subscribes to `QUESTS_SEND_HEARTBEAT_SUCCESS` events emitted by `FluxDispatcher` to track real-time server-side quest credit.

---

## Disclaimer

This software interacts with undocumented internal Discord APIs and client stores. It is intended for educational, research, and reverse engineering purposes only. Use of automated client modifications may violate the Discord Terms of Service. Use at your own discretion.
