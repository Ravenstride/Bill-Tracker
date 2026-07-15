# RavenBill 2.0 Clean

This branch contains a clean, local-first rebuild of RavenBill.

## Structure

- `index.html` — accessible application shell
- `styles.css` — responsive desktop, tablet, and phone UI
- `app.js` — bill logic, monthly rollover, payment history, reports, backup/restore
- `manifest.webmanifest` and `sw.js` — installable PWA support
- `rb-icon.svg` — RB app icon
- `vercel.json` — direct static deployment with no wrapper rewrite

## Core behavior

- Monthly recurring bills create a fresh unpaid instance each month.
- Fixed bills keep their configured amount.
- Previous-amount bills carry the last entered amount into the next month.
- Manual bills begin at zero until an amount is entered.
- Credit cards use the planned payment in monthly totals.
- Subscriptions use their recurring charge in monthly totals.
- Paid status never carries forward.
- Backup and restore use a JSON file stored by the user.
- Data remains in browser local storage unless exported.

## Test without Vercel

1. Download and extract the `ravenbill-2.0-clean` branch.
2. Open `index.html` in Chrome or Edge.
3. Use **Load Demo Data** in Settings for a quick walkthrough, or begin adding real bills.

The bill tracker works from the extracted folder. Installation as a PWA, service-worker caching, and browser notifications require the app to be served over HTTP or HTTPS.

Nothing on this branch has been deployed to Vercel.
