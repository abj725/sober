// db.js — All data persistence via localStorage

const DB = {

  // ── Keys ──────────────────────────────────────────────────────────────────
  KEYS: {
    SETTINGS:     'st_settings',
    DOSES:        'st_doses',       // array of {date, ts, confidence, passed}
    ONBOARDED:    'st_onboarded',
    PARTNER_LOG:  'st_partner_log', // array of {ts, type, msg}
    ALERT_CD:     'st_alert_cd',    // cooldown map {placeId: ts}
  },

  // ── Settings ──────────────────────────────────────────────────────────────
  defaultSettings() {
    return {
      userName: '',
      sobrietyDate: '',
      doseHour: 9,
      doseMinute: 0,
      threshold: 82,        // 70 | 82 | 92
      partnerName: '',
      partnerPhone: '',
      gpsEnabled: false,
      gpsRadius: 400,
      notifyDose: true,
      notifyMissed: true,
      notifyGps: true,
      reminderEnabled: true,
      reminderMinutesBefore: 30,
    };
  },

  getSettings() {
    try {
      const raw = localStorage.getItem(this.KEYS.SETTINGS);
      return raw ? { ...this.defaultSettings(), ...JSON.parse(raw) } : this.defaultSettings();
    } catch { return this.defaultSettings(); }
  },

  saveSettings(s) {
    localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(s));
  },

  // ── Onboarding ────────────────────────────────────────────────────────────
  isOnboarded() { return localStorage.getItem(this.KEYS.ONBOARDED) === '1'; },
  setOnboarded() { localStorage.setItem(this.KEYS.ONBOARDED, '1'); },

  // ── Dose records ──────────────────────────────────────────────────────────
  getDoses() {
    try {
      return JSON.parse(localStorage.getItem(this.KEYS.DOSES) || '[]');
    } catch { return []; }
  },

  saveDoses(doses) {
    localStorage.setItem(this.KEYS.DOSES, JSON.stringify(doses));
  },

  recordDose({ confidence = 100, passed = true } = {}) {
    const doses = this.getDoses();
    const today = this.todayStr();
    // Remove any existing entry for today (re-record allowed)
    const filtered = doses.filter(d => d.date !== today);
    filtered.push({ date: today, ts: Date.now(), confidence, passed });
    this.saveDoses(filtered);
    return this.getCurrentStreak();
  },

  todayDoseRecorded() {
    return this.getDoses().some(d => d.date === this.todayStr() && d.passed);
  },

  todayStr() {
    return new Date().toISOString().split('T')[0];
  },

  getCurrentStreak() {
    const doses = this.getDoses()
      .filter(d => d.passed)
      .map(d => d.date)
      .sort()
      .reverse();

    if (!doses.length) return 0;

    let streak = 0;
    let checkDate = new Date();
    checkDate.setHours(0, 0, 0, 0);

    for (const dateStr of doses) {
      const d = new Date(dateStr + 'T00:00:00');
      const diff = Math.round((checkDate - d) / 86400000);
      if (diff > 1) break;
      streak++;
      checkDate = d;
    }
    return streak;
  },

  getLongestStreak() {
    const doses = this.getDoses()
      .filter(d => d.passed)
      .map(d => d.date)
      .sort();

    if (!doses.length) return 0;
    let max = 1, cur = 1;
    for (let i = 1; i < doses.length; i++) {
      const prev = new Date(doses[i-1] + 'T00:00:00');
      const curr = new Date(doses[i]   + 'T00:00:00');
      const diff = Math.round((curr - prev) / 86400000);
      if (diff === 1) { cur++; max = Math.max(max, cur); }
      else cur = 1;
    }
    return max;
  },

  getTotalDoses()  { return this.getDoses().filter(d => d.passed).length; },
  getTotalMissed() {
    const doses = this.getDoses();
    const doseMap = new Set(doses.filter(d => d.passed).map(d => d.date));
    // Count days between sobriety start and today that are missing
    const settings = this.getSettings();
    const start = settings.sobrietyDate
      ? new Date(settings.sobrietyDate + 'T00:00:00')
      : (doses.length ? new Date(doses[0].date + 'T00:00:00') : new Date());
    const today = new Date(); today.setHours(0,0,0,0);
    let missed = 0;
    for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
      const ds = d.toISOString().split('T')[0];
      if (!doseMap.has(ds)) missed++;
    }
    return missed;
  },

  // Returns 35 CalendarDay objects (5 weeks ending today)
  getCalendarDays(weeks = 5) {
    const doses = new Set(this.getDoses().filter(d => d.passed).map(d => d.date));
    const today = new Date(); today.setHours(0,0,0,0);
    const days = [];
    for (let i = weeks * 7 - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().split('T')[0];
      const isToday = i === 0;
      const isPast = d <= today;
      days.push({
        date: ds,
        dayNum: d.getDate(),
        done: isPast && doses.has(ds),
        missed: isPast && !doses.has(ds) && !isToday,
        isToday
      });
    }
    return days;
  },

  // Returns last 8 weeks as WeekBar objects
  getWeekBars() {
    const doses = new Set(this.getDoses().filter(d => d.passed).map(d => d.date));
    const today = new Date(); today.setHours(0,0,0,0);
    const bars = [];
    for (let w = 7; w >= 0; w--) {
      const weekEnd = new Date(today);
      weekEnd.setDate(weekEnd.getDate() - w * 7);
      const weekStart = new Date(weekEnd);
      weekStart.setDate(weekStart.getDate() - 6);
      let done = 0, total = 0;
      for (let d = new Date(weekStart); d <= weekEnd && d <= today; d.setDate(d.getDate() + 1)) {
        total++;
        if (doses.has(d.toISOString().split('T')[0])) done++;
      }
      bars.push({
        label: weekStart.toLocaleDateString('en', { month: 'short', day: 'numeric' }),
        done, total
      });
    }
    return bars;
  },

  getComplianceRate() {
    const total = this.getTotalDoses() + this.getTotalMissed();
    if (!total) return 0;
    return this.getTotalDoses() / total;
  },

  // ── Partner log ───────────────────────────────────────────────────────────
  logPartnerEvent(type, msg) {
    const log = this.getPartnerLog();
    log.unshift({ ts: Date.now(), type, msg });
    if (log.length > 50) log.length = 50;
    localStorage.setItem(this.KEYS.PARTNER_LOG, JSON.stringify(log));
  },

  getPartnerLog() {
    try { return JSON.parse(localStorage.getItem(this.KEYS.PARTNER_LOG) || '[]'); }
    catch { return []; }
  },

  // ── Daily quote ───────────────────────────────────────────────────────────
  quotes: [
    { text: "Recovery is not a race. You don't have to feel guilty if it takes you longer than you thought.", author: "Anonymous" },
    { text: "Rock bottom became the solid foundation on which I rebuilt my life.", author: "J.K. Rowling" },
    { text: "Every day you don't drink is a day you're building a better life.", author: "Anonymous" },
    { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
    { text: "First you take a drink, then the drink takes a drink, then the drink takes you.", author: "F. Scott Fitzgerald" },
    { text: "One day at a time.", author: "AA Tradition" },
    { text: "Your life does not get better by chance; it gets better by change.", author: "Jim Rohn" },
    { text: "The greatest glory in living lies not in never falling, but in rising every time we fall.", author: "Nelson Mandela" },
    { text: "Recovery gives you the ability to be exactly who you are.", author: "Anonymous" },
    { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
    { text: "Strength grows in the moments when you think you can't go on but keep going anyway.", author: "Anonymous" },
    { text: "Healing is not linear, and that's okay.", author: "Anonymous" },
    { text: "You are braver than you believe, stronger than you seem.", author: "A.A. Milne" },
    { text: "Every morning you wake up sober is a victory.", author: "Anonymous" },
    { text: "Progress, not perfection.", author: "Anonymous" },
    { text: "You have survived 100% of your worst days.", author: "Anonymous" },
    { text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
    { text: "I am not defined by my past. I am prepared by it.", author: "Anonymous" },
    { text: "You can't go back and change the beginning, but you can start where you are and change the ending.", author: "C.S. Lewis" },
    { text: "Recovery is something you have to work on every single day.", author: "Demi Lovato" },
    { text: "Be patient with yourself. Self-growth is tender; it's holy ground.", author: "Alan Cohen" },
    { text: "You are worth more than your struggles.", author: "Anonymous" },
    { text: "Courage isn't the absence of fear — it's deciding something else is more important.", author: "Anonymous" },
    { text: "No matter how many mistakes you make, you are still way ahead of everyone who isn't trying.", author: "Tony Robbins" },
    { text: "The best time to plant a tree was 20 years ago. The second best time is now.", author: "Chinese Proverb" },
    { text: "Sometimes the bravest thing you can do is ask for help.", author: "Anonymous" },
    { text: "The most important step is the next one.", author: "Anonymous" },
    { text: "What you get by achieving your goals is not as important as what you become.", author: "Henry David Thoreau" },
    { text: "Pain you feel today is the strength you feel tomorrow.", author: "Anonymous" },
    { text: "You don't have to be perfect to be amazing.", author: "Anonymous" },
  ],

  getTodaysQuote() {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    return this.quotes[dayOfYear % this.quotes.length];
  },

  // ── Milestones ────────────────────────────────────────────────────────────
  getMilestones(streak) {
    const defs = [
      { days: 1,   label: 'First day',    icon: '🌱' },
      { days: 3,   label: 'Three days',   icon: '🔥' },
      { days: 7,   label: 'One week',     icon: '⭐' },
      { days: 14,  label: 'Two weeks',    icon: '🌙' },
      { days: 30,  label: 'One month',    icon: '🏆' },
      { days: 60,  label: 'Two months',   icon: '💎' },
      { days: 90,  label: 'Three months', icon: '🚀' },
      { days: 180, label: 'Six months',   icon: '🌊' },
      { days: 365, label: 'One year',     icon: '👑' },
      { days: 730, label: 'Two years',    icon: '🦋' },
    ];
    return defs.map(d => ({ ...d, achieved: streak >= d.days }));
  },

  // ── Sobriety clock ────────────────────────────────────────────────────────
  getSobrietyClock() {
    const settings = this.getSettings();
    const startStr = settings.sobrietyDate;
    if (!startStr) return null;
    const start = new Date(startStr + 'T00:00:00');
    const now = new Date(); now.setHours(0,0,0,0);
    const totalDays = Math.max(0, Math.floor((now - start) / 86400000));
    const years = Math.floor(totalDays / 365);
    const rem = totalDays % 365;
    const months = Math.floor(rem / 30);
    const days = rem % 30;
    return { totalDays, years, months, days, startDate: startStr };
  },

  // ── Store cache (for GPS screen display) ─────────────────────────────────
  saveNearbyStores(stores) {
    try {
      localStorage.setItem('st_nearby_stores', JSON.stringify(stores));
    } catch(e) {}
  },

  getNearbyStores() {
    try {
      return JSON.parse(localStorage.getItem('st_nearby_stores') || '[]');
    } catch { return []; }
  },

  // ── Reset ─────────────────────────────────────────────────────────────────
  resetAllData() {
    Object.values(this.KEYS).forEach(k => localStorage.removeItem(k));
  }
};

window.DB = DB;

// ── Store cache convenience wrapper ──────────────────────────────────────────
const StoreCache = {
  put(stores) { DB.saveNearbyStores(stores); },
  get()       { return DB.getNearbyStores(); }
};
window.StoreCache = StoreCache;
