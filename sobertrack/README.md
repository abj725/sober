# SoberTrack PWA

A Progressive Web App for Disulfiram accountability using Video Observed Therapy.

## Features

- **AI video verification** — Gemini 1.5 Flash confirms you swallowed your pill
- **GPS proximity alerts** — notifies your accountability partner if you're near a liquor store
- **Streak tracking** — animated ring, 30-day calendar heatmap, milestone badges
- **Daily motivational quotes** — 30 curated quotes, one per day
- **Partner notifications** — SMS via Twilio on dose recorded, missed dose, and GPS events
- **Works offline** — service worker caches the full app
- **Installable** — add to home screen on iPhone or Android

---

## Deploy to GitHub Pages (5 minutes)

### 1. Create the repository

```bash
# On your computer, in the sobertrack folder:
git init
git add .
git commit -m "Initial SoberTrack PWA"
git branch -M main
```

Create a new repository on github.com (name it `sobertrack` or anything you like), then:

```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin main
```

### 2. Enable GitHub Pages

1. Go to your repository on github.com
2. Click **Settings** → **Pages**
3. Under "Source", select **GitHub Actions**
4. The included workflow (`.github/workflows/deploy.yml`) will auto-deploy on every push

Your app will be live at: `https://YOUR_USERNAME.github.io/YOUR_REPO_NAME`

---

## Get your Gemini API key (free)

1. Go to [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Sign in with a Google account
3. Click **Create API key**
4. Copy the key (starts with `AIza`)
5. In SoberTrack → **Settings** → paste the key in the **Gemini API key** field

**Free tier:** 1,500 requests/day — more than enough for daily use.

---

## Install on your phone

### iPhone (Safari)
1. Open the app URL in Safari
2. Tap the **Share** button (box with arrow)
3. Scroll down and tap **Add to Home Screen**
4. Tap **Add**

### Android (Chrome)
1. Open the app URL in Chrome
2. Tap the three-dot menu → **Add to Home screen**
3. Tap **Add**

The app will appear on your home screen and run fullscreen like a native app.

---

## GPS + partner SMS (optional wiring)

For the full partner SMS experience, you'll need a Twilio account. Since GitHub Pages is static, you need a tiny serverless function to forward SMS:

**Option A — Netlify Functions (free)**
```javascript
// netlify/functions/sms.js
const twilio = require('twilio');

exports.handler = async (event) => {
  const { to, body } = JSON.parse(event.body);
  const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
  await client.messages.create({ to, body, from: process.env.TWILIO_FROM });
  return { statusCode: 200, body: 'OK' };
};
```

Set env vars in Netlify dashboard: `TWILIO_SID`, `TWILIO_TOKEN`, `TWILIO_FROM`

Then in `js/notifications.js`, uncomment and update `FUNCTION_URL`.

**Option B — Stay GitHub Pages only**
The app logs all partner events locally and shows them in the Partner tab. You can set up SMS forwarding later.

---

## File structure

```
sobertrack/
├── index.html              ← Full PWA (all 5 screens)
├── manifest.json           ← PWA install config
├── sw.js                   ← Service worker (offline support)
├── css/
│   └── app.css             ← All styles (dark theme, animations)
├── js/
│   ├── db.js               ← All data storage (localStorage)
│   ├── notifications.js    ← Push notifications, GPS, SMS
│   └── app.js              ← All screen logic, camera, AI verification
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
└── .github/
    └── workflows/
        └── deploy.yml      ← Auto-deploys to GitHub Pages on push
```

---

## Privacy

- **All data stays on your device** — no server stores your doses, streak, or recordings
- Video recordings are processed in memory and immediately discarded after AI verification
- Only the 3 extracted frames are sent to Gemini for analysis
- Partner SMS (when configured) goes through your own Twilio account

---

## Built with

- Vanilla JS + CSS (no framework dependencies)
- Google Gemini 1.5 Flash for video verification
- Overpass API for liquor store proximity (free, no key needed)
- Twilio for SMS (optional)
- GitHub Pages for hosting (free)
