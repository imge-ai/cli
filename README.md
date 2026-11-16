# imge

![A recorded browser agent session](assets/demo.gif)

**See what your agent saw.** imge records browser actions made through its Playwright MCP proxy and lets you replay the screenshots alongside the accessibility text the agent received. Sessions stay on your machine.

## Install

Requires Node.js 20+ and an MCP client. Install directly with NPX:

```bash
npx --yes @imge/cli@latest setup --client codex
```

Replace `codex` with `cursor`, `claude-code`, `claude-desktop`, or `vs-code`. Omit `--client` to configure all five. The setup command shows the proposed config and asks before writing it. Add `--data-dir "/path/to/imge sessions"` to choose where recordings are stored; that directory is saved in the client config and used after restarts. Restart your agent after installation.

Alternatively, paste this sentence into your AI coding agent:

> Install imge for this agent. Identify whether you are Codex, Cursor, Claude Code, Claude Desktop, or VS Code. Run `npx --yes @imge/cli@latest setup --client <client> --yes`. When browser work is done, include a clickable [Open the imge session replay](http://localhost:4747) link. Explain that replay server closes with the MCP session but recordings remain on disk, and that I can change their directory later with `IMGE_HOME`.

The agent still runs the same NPX command; the sentence is a convenient way to ask it to do the setup. `--yes` on the setup command skips imge's interactive confirmation because the instruction authorizes the config change. The first `--yes` is for NPX's package install prompt.

### Client configuration

| Client | Config file | Direct command |
|---|---|---|
| Codex | `~/.codex/config.toml` | `npx --yes @imge/cli@latest setup --client codex` |
| Cursor | `~/.cursor/mcp.json` | `npx --yes @imge/cli@latest setup --client cursor` |
| Claude Code | `~/.claude.json` | `npx --yes @imge/cli@latest setup --client claude-code` |
| Claude Desktop | Claude's desktop config | `npx --yes @imge/cli@latest setup --client claude-desktop` |
| VS Code | `~/.copilot/mcp-config.json` | `npx --yes @imge/cli@latest setup --client vs-code` |

The installed MCP entry runs `npx --yes @imge/cli@latest mcp`. imge backs up an existing config before editing it and leaves other MCP servers in place.

## Record a session

Ask a configured agent:

> Use the imge browser tools to open https://example.com, describe the page, and click a link.

The agent must use the **imge MCP browser tools**. Its built-in browser will not be recorded. After the first browser action, imge opens the controlled browser and replay player automatically at `http://localhost:4747`. The player refreshes sessions and steps as they are recorded. When the MCP session ends, its local replay server stops; recordings remain on disk. The agent is instructed to include a replay link in its final response. You can open the player any time with `npx --yes @imge/cli@latest`. By default, one MCP process creates one session in `~/.imge/mcp/sessions/<sessionId>/`, with `steps.jsonl` and a PNG for each action. The player shows the screenshot and the text the agent saw, plus errors and same-name warnings. Password and card fields are masked in saved text and screenshots.

## Uninstall

After installing the MCP server, remove its entry from the same client config and restart the agent:

```bash
npx --yes @imge/cli@latest uninstall --client codex
```

Use the relevant client name from the table above, or omit `--client` to remove imge from all five. The command asks before changing files, backs up changed configs, and preserves other MCP entries. To remove a globally installed npm executable, also run `npm uninstall -g @imge/cli` if you installed it globally. NPX itself needs no global uninstall.

The default session directory is `~/.imge/mcp/sessions/`. Choose another location with `--data-dir` during setup. To change it later, update the `IMGE_HOME` value in the client’s imge MCP config and restart the client. Existing recordings stay in their original directory; imge does not move them automatically. Saved sessions are independent of the MCP config. To delete them, run `npx --yes @imge/cli@latest clear` and confirm. This deletes recordings under `~/.imge/mcp/sessions/`.

## Commands

| Command | Action |
|---|---|
| `npx --yes @imge/cli@latest setup [--client <name>] [--data-dir <path>]` | Install the MCP entry and optionally choose where recordings are saved. |
| `npx --yes @imge/cli@latest uninstall [--client <name>]` | Remove the MCP entry. |
| `npx --yes @imge/cli@latest mcp` | Run the stdio browser proxy. |
| `npx --yes @imge/cli@latest` | Open the local player. |
| `npx --yes @imge/cli@latest clear` | Delete recordings after confirmation. |

## Development

```bash
bun install
bun run check
bun test
bun run build
```

The build runs on Node 20+ without Bun. The replay UI starts after the first recorded browser action and refreshes sessions and steps automatically. It stops with the MCP session; saved recordings remain on disk. The proxy forwards Playwright MCP calls and results without modifying what the agent sees. It launches Chrome through CDP and captures screenshots from a separate connection. It does not capture browser network traffic or agents using their own cloud browser.

MIT licensed. Source: [imge-ai/cli](https://github.com/imge-ai/cli).
