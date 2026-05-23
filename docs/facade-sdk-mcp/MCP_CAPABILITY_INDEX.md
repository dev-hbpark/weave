# MCP Capability Index — weave

Index of every MCP server this project ships, plus its owning package, transport, status, and the DR that approved it. See `docs/04-specialized-engineering/FACADE_SDK_MCP_ENABLEMENT.md` (OS-root) for design rules.

## Servers

| Server | Version | Package | Transport | Status | Decision Record | One-line purpose |
|---|---|---|---|---|---|---|
| <!-- example-server --> | <!-- 0.1.0 --> | <!-- packages/example --> | <!-- stdio --> | <!-- Draft / Trial / Production / Deprecated --> | <!-- DR-007-mcp-example.md --> | <!-- "..." --> |

## Adding a new server

1. Run the `mcp-capability-design` skill (or `/mcp-design`).
2. Produce the per-server documentation artifact from `docs/04-specialized-engineering/MCP_CAPABILITY_DOCUMENTATION_TEMPLATE.md`, save at `packages/<name>/docs/MCP.md`.
3. Add one row to the table above.
4. Link the approving Decision Record.

## Deprecating a server

1. Status → `Deprecated` in the table; add deprecation date in the row.
2. Emit deprecation warning in tool output for ≥ one minor version.
3. Keep documentation alive until removal date.
4. On removal, move the row to the `Removed` section below with the removal DR.

## Removed

(none)
