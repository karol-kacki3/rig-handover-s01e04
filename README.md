# rig

Keeps a lane's lights on while nobody is in it: a heartbeat every minute, a status board, and
(next) a morning digest of what ran overnight.

```sh
cp .env.example .env   # set LANE_MARKER
pnpm install
pnpm dev               # http://localhost:8787
```

Working on it with an agent: start at [AGENTS.md](AGENTS.md).

## Public digest preview

The **Digest preview** workflow is manual only; pushes never deploy. It starts rig on
Node 24, saves `/digest/2026-10-28` with `curl`, checks that the HTML is self-contained,
and deploys one `index.html` to GitHub Pages. The page is public, including its lane
banner. Never commit the saved page, `.env`, or a marker value.

1. Wait until the digest route is merged. Get human approval before enabling Pages
   (Settings → Pages → Source: GitHub Actions), adding the repository Actions secret
   `LANE_MARKER`, or publishing. Configure required reviewers on the `github-pages`
   environment where available, so deployment requires approval too.
2. After explicit approval for the initial public deployment, run **Actions → Digest
   preview → Run workflow** on the reviewed default branch with `include_marker: true`.
   Approve the environment job if prompted. Share the HTTPS URL from the deployment
   and the plan's issue links with the reviewer; issue #6 stays open until sent.
3. After review, get separate human approval to replace the public page. Run the same
   workflow on the same branch with `include_marker: false`. This passes an empty
   `LANE_MARKER`, replacing the page at the same URL with a “no marker set” banner.
   Verify that banner at the public URL.
4. Delete the old marker-bearing `github-pages` artifact from the initial Actions run
   after review (with human approval); retention is one day, but expiration alone does
   not replace the live page. Do not copy the artifact into git, issues, or attachments.

No Pages settings, secrets, or deployments are created by merely committing this workflow.
