# Who is ACR *not* for?

Being explicit builds trust. You probably **do not** need ACR if:

| Situation | Why skip ACR |
|-----------|----------------|
| Your agent **only reads** data | No side-effect governance required — auth at data layer may suffice |
| Tools are already in a **hard sandbox** (WASM, isolated VM, no network) | Runtime policy duplicates isolation you already paid for |
| You only need **static API keys** for a single cron job | A capability layer adds moving parts without agent autonomy risk |
| **No human approval** workflow will ever exist | You still might want domain limits — but ROI is lower |
| One-shot scripts with **no LLM** | Use normal IAM / service accounts |
| Team has **no ops** to run a gateway or embed runtime | Start with policy in app code; adopt ACR when agents multiply |

## ACR shines when

- Multiple agents share integrations but need **different** limits
- **Prompt injection** could change tool arguments at execute time
- Compliance asks **who approved** this send/payment/API call
- You must **revoke one agent** without killing the whole OAuth app

Still unsure? Run `pnpm demo:wow` — if none of the three moments (deny / approval / revoke) resonate, you may be early for adoption.
