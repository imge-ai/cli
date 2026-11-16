# imge

![A recorded browser agent session](assets/demo.gif)

**See what your agent saw.** imge records browser sessions locally and replays screenshots beside the accessibility text your agent received.

## Install

Requires Node.js 20+ and an MCP client.

```bash
npx --yes @imge/cli@latest setup --client codex
```

Choose `cursor`, `claude-code`, `claude-desktop`, or `vs-code` for another client. Omit `--client` to configure all supported clients. Restart the client after setup.

To ask your coding agent to install imge, copy this prompt:

> Install imge for this agent. Identify the client and run `npx --yes @imge/cli@latest setup --client <client> --yes`. After using imge, include a clickable [Open the imge session replay](http://localhost:4747) link in your final answer. The replay server closes with the MCP session; recordings stay on disk.

## Use

Ask the agent to use the **imge browser tools** to visit a site. After its first browser action, imge opens the replay at [http://localhost:4747](http://localhost:4747). The page updates as the session is recorded. It stops when the MCP session ends.

By default, recordings are saved under `~/.imge/mcp/sessions/`. Choose another directory during setup:

```bash
npx --yes @imge/cli@latest setup --client codex --data-dir "/path/to/imge sessions"
```

To change it later, update `IMGE_HOME` in the imge MCP entry for that client, then restart the client. imge leaves existing recordings where they are; it does not move them.

## Uninstall

Remove imge from one client and restart it:

```bash
npx --yes @imge/cli@latest uninstall --client codex
```

Use the same client names as above, or omit `--client` to remove imge from all of them. To delete recordings, run `npx --yes @imge/cli@latest clear` and confirm. Uninstalling imge does not delete recordings.

## Development

```bash
bun install
bun run check
bun test
bun run build
```

imge runs on Node.js 20+ without Bun. Password and payment fields are masked in saved text and screenshots. MIT licensed. Source: [imge-ai/cli](https://github.com/imge-ai/cli).
