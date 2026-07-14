# RavenBill 2.0

RavenBill 2.0 is a mobile-friendly personal bill tracker, schedule, and reminder center built around the approved dark three-column RavenBill dashboard.

## Branding assets

The desktop and phone branding are deliberately separate so a detailed logo is never squeezed into a tiny app icon.

- `raven-logo.svg` — responsive main-site asset. At normal desktop-sidebar size it displays the fuller raven illustration. At very small icon sizes and Apple touch-icon size it switches to the simplified raven artwork inside the SVG.
- `ravenbill-mobile-icon.svg` — dedicated simplified PWA/app icon used by `manifest.webmanifest` for Home Screen installation.

Both assets use a proper raven profile with a substantial curved beak and a shaggy throat silhouette, while the phone version removes small feather detail for clarity.

## Included

- Approved dark RavenBill 2.0 desktop layout
- Separate desktop raven branding and simplified phone app icon
- Automatic common-bill setup for every new month
- Monthly, yearly, and one-time bills
- Autopay amounts carried into the next applicable month
- Personal appointments and monthly calendar
- Per-bill and per-appointment reminder timing
- Phone calendar export with built-in alerts
- Optional on-device notifications while RavenBill is active
- Mobile bottom navigation and responsive cards
- Local browser storage and JSON backup

## Vercel

Upload the contents of this package to Vercel as a static project. No build command is required.

For a Git-connected deployment, deploy the `ravenbill-2.0` branch.

## Phone installation

Open the deployed site in Safari or Chrome and choose **Add to Home Screen**. Remove an older RavenBill shortcut before reinstalling so the phone does not retain the previous icon.

## Phone reminders

Open **Reminders** and select **Add next 12 months**. Open the downloaded `.ics` file on your phone and add the events to your calendar. Those alerts are handled by the phone calendar and work when RavenBill is closed.

## Storage

Data is stored in the browser on the device being used. Use **Backup data** regularly.
