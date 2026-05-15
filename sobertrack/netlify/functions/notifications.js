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

  // ── Partner SMS via Netlify function → Twilio ────────────────────────────
  // FUNCTION_URL is set automatically when deployed to Netlify.
  // Falls back gracefully (logs only) when running on GitHub Pages or localhost.
  FUNCTION_URL: typeof __NETLIFY_FUNCTION_URL__ !== 'undefined'
    ? __NETLIFY_FUNCTION_URL__
    : '/.netlify/functions/sms',

  async sendPartnerSMS(type, data = {}) {
    const settings = DB.getSettings();
    if (!settings.partnerPhone || !settings.partnerName) return;

    const name = settings.userName || 'Your person';
    const messages = {
      dose:   `✅ ${name} recorded their Disulfiram at ${this._timeStr()} — Day ${data.streak} sober (AI confidence: ${data.confidence}%)`,
      missed: `⚠️ ${name} has not yet recorded their Disulfiram today. Current streak: ${data.streak} days.`,
      gps:    `📍 GPS alert: ${name} is ${data.distance}m from ${data.store}. This is an automated SoberTrack alert.`,
    };

    const msg = messages[type] || '';

    // Always log locally so Partner tab shows the event
    console.log('[PartnerSMS]', settings.partnerPhone, '→', msg);
    DB.logPartnerEvent(type, msg);

    // Send via Netlify function
    try {
      const resp = await fetch(this.FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: settings.partnerPhone, body: msg })
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        console.error('[PartnerSMS] Netlify function error:', err);
      } else {
        console.log('[PartnerSMS] SMS sent successfully');
      }
    } catch (e) {
      // Silently fail on localhost / GitHub Pages (no function available)
      console.warn('[PartnerSMS] Could not reach SMS function (expected on GitHub Pages):', e.message);
    }
  },

  _timeStr() {
    return new Date().toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit', hour12: true });
  },

  // ── GPS proximity ─────────────────────────────────────────────────────────
  GOOGLE_PLACES_KEY: '',  // Set your key via settings or env

  PLACES_URL: '/.netlify/functions/places',

  async checkProximity() {
    const settings = DB.getSettings();
    if (!settings.gpsEnabled) return;

    navigator.geolocation.getCurrentPosition(async pos => {
      const { latitude: lat, longitude: lng } = pos.coords;

      try {
        // Call our server-side Google Places function
        const resp = await fetch(this.PLACES_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat, lng, radius: settings.gpsRadius })
        });

        if (!resp.ok) {
          console.warn('[GPS] Places function error:', resp.status);
          return;
        }

        const { stores } = await resp.json();
        if (!stores || stores.length === 0) return;

        // Update the local store cache for the partner/GPS screen
        StoreCache.put(stores);

        // Load cooldown map
        const cd = JSON.parse(localStorage.getItem(DB.KEYS.ALERT_CD) || '{}');
        const cooldown = 30 * 60 * 1000;

        for (const store of stores) {
          // Only alert for stores within the user's chosen radius
          if (store.distanceMeters > settings.gpsRadius) continue;

          // Cooldown check — don't re-alert for same store within 30 min
          const lastAlert = cd[store.placeId] || 0;
          if (Date.now() - lastAlert < cooldown) continue;

          // Record alert time
          cd[store.placeId] = Date.now();
          localStorage.setItem(DB.KEYS.ALERT_CD, JSON.stringify(cd));

          // On-device notification
          this.show(
            '⚠️ Liquor store nearby',
            `${store.name} is ${store.distanceMeters}m away. Your partner has been notified.`,
            { tag: 'gps-alert', requireInteraction: true }
          );

          // Partner SMS
          this.sendPartnerSMS('gps', {
            store: store.name,
            distance: store.distanceMeters
          });

          // Only alert for the closest store per check cycle
          break;
        }

      } catch(e) {
        console.warn('[GPS] Proximity check failed:', e.message);
      }
    }, err => console.warn('[GPS] Geolocation error:', err), {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 60000
    });
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
