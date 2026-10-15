# VOIDtv Beta

A small app for the testers you choose. It sits beside VOIDtv, not inside it: its own Cloudflare Pages
project (`voidtv-beta`), its own storage (KV namespace `voidtv-beta-db`), its own address
(https://voidtv-beta.pages.dev). Nothing here reads or changes VOIDtv.

## You (admin)

- Open **BETA-ADMIN.cmd** in the void-channel folder. It opens https://voidtv-beta.pages.dev/admin already unlocked.
  On another device, open /admin and paste the key from `backend/.env` (`BETA_ADMIN_KEY`).
- **Testers**: type a name, press Create invite, then Copy message (or Share on a phone) and send it.
  Send the VOIDtv password separately. Pause stops an invite working; Remove deletes it (their reports stay).
- **Reports**: newest first, filter by open/new/fixed, kind and tester. Tap one to see the full text, page link,
  device and screenshot. Set a status and write a reply; the tester sees both in their app.
- **Note**: a line shown at the top of every tester's app ("What to try right now").

## Testers

They open their invite link once, add it to the home screen (the page tells them how on iPhone and Android),
and from then on tap it to: open VOIDtv, pick what kind of report it is, say what happened, attach a screenshot,
and see your replies. Their device, browser and screen size go along automatically; nothing else.

## Limits and notes

- 40 reports per tester per day. Screenshots are shrunk on the phone before sending.
- Lists can take up to a minute to reflect a change (Cloudflare KV is eventually consistent).
- Free-tier KV allows about 1,000 writes a day, plenty for a closed beta.
- Deploy changes: `cd beta` then `npx wrangler pages deploy --branch main`. Rotate the admin key:
  change `BETA_ADMIN_KEY` in backend/.env and run `npx wrangler pages secret put ADMIN_KEY --project-name voidtv-beta`.
