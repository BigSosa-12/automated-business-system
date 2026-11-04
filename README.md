# Prospect Foundry · Command Center

Read-only monitoring dashboard for the Prospect Foundry outreach system. **Observability only**: it never sends email, changes suppression or leads, touches queues or locks, or triggers any run.

```
OutreachQueue (SQLite + reports + ledgers + task XML)
   └─ exporter/export-snapshot.mjs   read-only · sanitize · validate · atomic write
        └─ dashboard/public/data/snapshot.json   (aggregates only: no names, addresses, reply text)
             └─ git commit/push (only that file, only when changed)
                  └─ GitHub Actions → GitHub Pages (dashboard/, React + Vite, Midnight Lavender Glass)
```

## Run it
| What | Command |
|---|---|
| Tests | `npm test` |
| One export (no publish) | `npm run export` |
| Export + commit + push | `npm run export:publish` |
| Every 5 min (Windows) | `powershell -File exporter\install-task.ps1` (`-Remove` to uninstall) |
| Private lead explorer (local only) | `npm run explorer` → http://127.0.0.1:4477 |
| Build dashboard | `npm run dashboard:build` |

Needs Node 22.13+ (built-in `node:sqlite`; the exporter has no packages). Source folder defaults to `C:\Users\hahak\OneDrive\Desktop\OutreachQueue`; override with `FOUNDRY_DIR` or `--src`.

## Rules the exporter follows
- SQLite opened `readOnly` in one short transaction. Never writes to the production folder.
- Skips entirely inside the protected dispatch windows (`[slot-5, slot+15)`, same math as `FoundryRun.ps1`; slots come from the task XML: 9:30 AM / 1:00 PM / 4:00 PM ET).
- Own lock (`exporter/state/exporter.lock`); never writes the production `foundry_execution.lock`.
- Hard gates before anything is written: scrub → no emails/paths/credentials → schema validation. On failure the previous snapshot stays.
- Commits only when content changed (plus a 30-minute heartbeat re-stamp). Uses your existing Git sign-in; no tokens anywhere.

## Health and honesty
`BLOCKED` a blocking check fails · `UNKNOWN` critical evidence missing · `DEGRADED` any warning · `HEALTHY` all checks pass. Unavailable metrics show `NOT TRACKED`, never `0`. "Confirmed send" = Gmail API accepted + ledger evidence (not inbox delivery). The page marks data **STALE** after 75 minutes without a new snapshot and then shows health as UNKNOWN.

## Privacy
GitHub Pages is reachable by anyone with the link. Only aggregates are published. Business names, contacts and history live only in the local explorer.

## Template Studio (private, local only)

`npm run studio` starts a localhost-only page (http://127.0.0.1:4478) listing every outreach email template by service (18 active each, including your existing ones read from `OutreachTemplates.json`).

- **Like** keeps a template (and locks Change). **Dislike** retires it for good and a replacement is added so each service stays above 15. **Change** retires it and generates a new style.
- Mark **Already sent?** per template. Send history does not record which template was used, so this cannot be detected automatically.
- Decisions are saved to `studio/state/` (git-ignored, never published): `studio.json` and `template-decisions.json` (liked list plus a `doNotUse` exclusion list).
- It never writes to OutreachQueue, SQLite, Gmail or the scheduler. The sender does not read the decisions file until it is deliberately wired in.
