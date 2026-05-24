/**
 * 60-second quickstart — run after `pnpm install && pnpm build`:
 *   pnpm demo:quick
 */
import { main } from "./demo-wow.js";

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
