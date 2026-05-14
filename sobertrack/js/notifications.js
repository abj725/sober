// notifications.js — Push notifications, dose reminders, partner alerts

const Notif = {

  // ── Permission ────────────────────────────────────────────────────────────
  async requestPermission() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    const result = await Notification.requestPermission();
    return result === 'granted';
  },

  hasPermission() {
    return 'Notification' in window && Notification.permission === 'granted';
  },

  // ── Local notification ────────────────────────────────────────────────────
  show(title, body, options = {}) {
    if (!this.hasPermission()) return;
    const reg = window._swReg;
    if (reg) {
      reg.showNotification(title, {
        body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: options.tag || 'sobertrack',
        renotify: true,
        ...options
      });
    } else {
      new Notification(title, { body, icon: '/icons/icon-192.png', ...options });
    }
  },

  // ── Dose reminder scheduling ──────────────────────────────────────────────
  scheduleDoseReminder() {
    const settings = DB.getSettings();
    if (!settings.reminderEnabled || !this.hasPermission()) return;

    // Clear any existing timer
    if (window._reminderTimer) clearTimeout(window._reminderTimer);

    const now = new Date();
    const deadline = new Date();
    deadline.setHours(settings.doseHour, settings.doseMinute, 0, 0);

    // Reminder fires N minutes before deadline
    const reminderTime = new Date(deadline.getTime() - settings.reminderMinutesBefore * 60000);
    let delay = reminderTime - now;
    if (delay < 0) delay += 86400000; // tomorrow

    window._reminderTimer = setTimeout(() => {
      if (!DB.todayDoseRecorded()) {
        this.show(
          'Time to take your medication',
          `Record your Disulfiram dose — deadline in ${settings.reminderMinutesBefore} minutes`,
          { tag: 'dose-reminder', requireInteraction: true }
        );
      }
      this.scheduleDoseReminder(); // re-schedule for tomorrow
    }, delay);
  },

  scheduleMissedDoseCheck() {
    const settings = DB.getSettings();
    if (!settings.notifyMissed || !this.hasPermission()) return;
    if (window._missedTimer) clearTimeout(window._missedTimer);

    const now = new Date();
    const deadline = new Date();
    deadline.setHours(settings.doseHour, settings.doseMinute, 0, 0);

    // Check 15 minutes after deadline
    const checkTime = new Date(deadline.getTime() + 15 * 60000);
    let delay = checkTime - now;
    if (delay < 0) delay += 86400000;

    window._missedTimer = setTimeout(() => {
      if (!DB.todayDoseRecorded()) {
        const streak = DB.getCurrentStreak();
        this.show(
          '⚠️ Dose not yet recorded',
          `You haven't recorded your Disulfiram today. Streak: ${streak} days.`,
          { tag: 'dose-missed', requireInteraction: true }
        );
        // Partner SMS (if configured)
        this.sendPartnerSMS('missed', { streak });
      }
      this.scheduleMissedDoseCheck();
    }, delay);
  },

  // ── Partner SMS via Twilio (needs a proxy server or Netlify function) ─────
  // For a pure GitHub Pages deploy, this sends via a serverless function.
  // Until then, logs to console and DB so it can be wired up later.
  async sendPartnerSMS(type, data = {}) {
    const settings = DB.getSettings();
    if (!settings.partnerPhone || !settings.partnerName) return;

    const name = settings.userName || 'Your person';
    const messages = {
      dose: `✅ ${name} recorded their Disulfiram at ${this._timeStr()} — Day ${data.streak} sober (AI confidence: ${data.confidence}%)`,
      missed: `⚠️ ${name} has not yet recorded their Disulfiram today. Current streak: ${data.streak} days.`,
      gps: `📍 GPS alert: ${name} is ${data.distance}m from ${data.store}. This is an automated SoberTrack alert.`,
    };

    const msg = messages[type] || '';
    console.log('[PartnerSMS]', settings.partnerPhone, '→', msg);
    DB.logPartnerEvent(type, msg);

    // TODO: Replace with your Netlify/Vercel function URL:
    // const FUNCTION_URL = 'https://your-site.netlify.app/.netlify/functions/sms';
    // try {
    //   await fetch(FUNCTION_URL, {
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json' },
    //     body: JSON.stringify({ to: settings.partnerPhone, body: msg })
    //   });
    // } catch(e) { console.error('SMS failed', e); }
  },

  _timeStr() {
    return new Date().toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit', hour12: true });
  },

  // ── GPS proximity ─────────────────────────────────────────────────────────
  GOOGLE_PLACES_KEY: '',  // Set your key via settings or env

  async checkProximity() {
    const settings = DB.getSettings();
    if (!settings.gpsEnabled) return;

    navigator.geolocation.getCurrentPosition(async pos => {
      const { latitude: lat, longitude: lng } = pos.coords;

      // Without a real Places API key we simulate with hardcoded nearby types.
      // In production: query nearby liquor_store|bar|night_club via Places API.
      // For the demo we use the Overpass API (free, no key needed) to find pubs/off-licences.
      try {
        const radius = settings.gpsRadius;
        const query = `[out:json][timeout:10];(node["amenity"~"bar|pub|nightclub"](around:${radius},${lat},${lng});node["shop"="alcohol"](around:${radius},${lat},${lng}););out body;`;
        const resp = await fetch('https://overpass-api.de/api/interpreter', {
          method: 'POST',
          body: query
        });
        const data = await resp.json();

        if (data.elements && data.elements.length > 0) {
          const store = data.elements[0];
          const name = store.tags?.name || 'a liquor store';

          // Haversine distance
          const dist = this._haversine(lat, lng, store.lat, store.lon);

          // Cooldown check
          const cd = JSON.parse(localStorage.getItem(DB.KEYS.ALERT_CD) || '{}');
          const storeId = store.id.toString();
          const lastAlert = cd[storeId] || 0;
          const cooldown = 30 * 60 * 1000;
          if (Date.now() - lastAlert < cooldown) return;

          // Fire alert
          cd[storeId] = Date.now();
          localStorage.setItem(DB.KEYS.ALERT_CD, JSON.stringify(cd));

          this.show(
            '⚠️ Liquor store nearby',
            `${name} is ${Math.round(dist)}m away. Your partner has been notified.`,
            { tag: 'gps-alert', requireInteraction: true }
          );
          this.sendPartnerSMS('gps', { store: name, distance: Math.round(dist) });
        }
      } catch(e) {
        console.warn('Proximity check failed:', e);
      }
    }, err => console.warn('Geolocation error:', err), {
      enableHighAccuracy: true, timeout: 10000
    });
  },

  _haversine(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
    const dp = (lat2 - lat1) * Math.PI / 180;
    const dl = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dp/2)**2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  },

  startGpsMonitoring() {
    if (window._gpsInterval) clearInterval(window._gpsInterval);
    this.checkProximity();
    window._gpsInterval = setInterval(() => this.checkProximity(), 5 * 60 * 1000);
  },

  stopGpsMonitoring() {
    if (window._gpsInterval) { clearInterval(window._gpsInterval); window._gpsInterval = null; }
  },

  // ── Init ──────────────────────────────────────────────────────────────────
  init() {
    this.scheduleDoseReminder();
    this.scheduleMissedDoseCheck();
    const settings = DB.getSettings();
    if (settings.gpsEnabled) this.startGpsMonitoring();
  }
};

window.Notif = Notif;
