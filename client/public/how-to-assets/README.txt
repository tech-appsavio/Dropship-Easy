Place the how-to page screenshots in THIS folder using these EXACT filenames
(the how-to.html page references them by these names):

  01-order-selection.png          → Step 1 — Order Selection screen
  02-supplier-selection.png       → Step 2 — Supplier Selection screen
  03-courier-selection.png        → Step 3 — Courier Selection screen
  04-create-shipment-manifest.png → Step 4 — Create Shipment & Manifest screen
  05-order-tracking.png           → Order Tracking (item view) screen

Notes:
- PNG or JPG both work, but keep the .png names above (or update the <img src> in
  client/public/how-to.html to match your extension).
- Files in client/public are copied verbatim into client/build at build time and
  served same-origin (e.g. https://<app>/how-to-assets/01-order-selection.png), so
  the page stays self-contained and iframe-embeddable — no external image hosts.
- After adding the files, rebuild the client (CI=false npx react-scripts build) so
  build/how-to-assets/ is populated, then deploy.
