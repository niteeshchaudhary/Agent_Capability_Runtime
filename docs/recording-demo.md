# Recording `demo:wow` for README (GIF / asciinema)

Animated demos are one of the highest-conversion OSS assets. Record once, embed in README.

## Option A: asciinema (recommended)

```bash
# Install: https://asciinema.org/docs/installation
pnpm install && pnpm build
asciinema rec -c "pnpm demo:wow" -t "ACR demo:wow" -o docs/assets/demo-wow.cast
```

Upload to [asciinema.org](https://asciinema.org) or host the `.cast` file in the repo.

README embed (replace `YOUR_ID` after upload):

```markdown
[![asciicast](https://asciinema.org/a/YOUR_ID.svg)](https://asciinema.org/a/YOUR_ID)
```

## Option B: Terminal GIF

```bash
pnpm demo:wow | tee /tmp/demo-wow.txt
# Install agg: https://github.com/asciinema/agg
asciinema rec -c "pnpm demo:wow" -o docs/assets/demo-wow.cast
agg docs/assets/demo-wow.cast docs/assets/demo-wow.gif
```

Commit `docs/assets/demo-wow.gif` and add to README:

```markdown
![pnpm demo:wow](./docs/assets/demo-wow.gif)
```

## Option C: Screen recording

Record terminal with OBS, Screen Studio, or Windows Terminal export — keep under **30 seconds**, show DENY → REQUIRE_APPROVAL → revoke.

## Checklist

- [ ] Font size readable at GitHub README width
- [ ] Dark theme consistent with brand
- [ ] No secrets in recording (uses dev signing secret)
- [ ] Link `pnpm demo:wow` in caption
