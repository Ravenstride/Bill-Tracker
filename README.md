# RavenBill

RavenBill is a mobile-friendly personal bill tracker, schedule, and reminder center.

## Included

- Dark blue RavenBill dashboard
- Automatic common-bill setup for every new month
- Monthly, yearly, and one-time bills
- Autopay amounts carried into the next applicable month
- Personal appointments and monthly calendar
- Per-bill and per-appointment reminder timing
- Phone calendar export with built-in alerts
- Optional on-device notifications while RavenBill is active
- Mobile bottom navigation and responsive cards
- Local browser storage and JSON backup

## Phone reminders

Open **Reminders** and select **Add next 12 months to phone calendar**. Open the downloaded `.ics` file on your phone and add the events to your calendar. Those alerts are handled by the phone calendar and work when RavenBill is closed.

RavenBill's optional on-device alerts are checked when the app opens, returns to the foreground, or regains focus. Fully remote push notifications while the app is closed would require a separate push-notification server.

## Vercel

Import this repository into Vercel as a static project. No build command is required. After a deployment update, refresh once or close and reopen the installed app so the service worker can update.

## iPhone

Open the deployed site in Safari, tap **Share**, then **Add to Home Screen**.

## Storage

Data is stored in the browser on the device being used. Use **Backup data** regularly.
