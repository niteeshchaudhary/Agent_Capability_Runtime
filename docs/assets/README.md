# Assets for README and social

| File | Use |
|------|-----|
| [architecture.svg](./architecture.svg) | Architecture diagram — embed in README: `![Architecture](./docs/assets/architecture.svg)` |
| [demo-wow-terminal.txt](./demo-wow-terminal.txt) | Source text for terminal screenshot |

## Capture a terminal screenshot

```bash
pnpm demo:wow
```

Use [carbon.now.sh](https://carbon.now.sh) or your terminal screenshot tool with the output.

Recommended README image path after capture:

```
docs/assets/demo-wow.png
```

Then add to README:

```markdown
![demo:wow](./docs/assets/demo-wow.png)
```
