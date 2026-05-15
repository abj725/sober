// app.js — SoberTrack PWA core application

// ── AI Verification ──────────────────────────────────────────────────────────
// Calls our Netlify server function — Gemini API key stays on the server,
// never exposed to users or visible in the browser.
const AI = {
  VERIFY_URL: '/.netlify/functions/verify',

  async verifyFrames(base64Frames) {
    const resp = await fetch(this.VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frames: base64Frames })
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `Server error ${resp.status}`);
    }

    return resp.json();
  },

  extractFrameFromVideo(video, timeSeconds) {
    return new Promise(resolve => {
      const canvas = document.createElement('canvas');
      canvas.width = 640; canvas.height = 480;
      const ctx = canvas.getContext('2d');
      const seeked = () => {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const b64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
        video.removeEventListener('seeked', seeked);
        resolve(b64);
      };
      video.addEventListener('seeked', seeked);
      video.currentTime = Math.min(timeSeconds, video.duration - 0.1);
    });
  }
};

// ── Router / Navigation ───────────────────────────────────────────────────────
const Router = {
  current: 'home',

  go(tab) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const screen = document.getElementById(`screen-${tab}`);
    const navItem = document.querySelector(`.nav-item[data-tab="${tab}"]`);
    if (screen) screen.classList.add('active');
    if (navItem) navItem.classList.add('active');
    this.current = tab;
    // Render dynamic content for each tab
    Screens.render(tab);
  }
};

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg, duration = 2800) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => t.classList.remove('show'), duration);
}

// ── Screen renderers ──────────────────────────────────────────────────────────
const Screens = {
  render(tab) {
    switch(tab) {
      case 'home':     this.renderHome(); break;
      case 'checkin':  this.renderCheckin(); break;
      case 'partner':  this.renderPartner(); break;
      case 'progress': this.renderProgress(); break;
      case 'settings': this.renderSettings(); break;
    }
  },

  // ── HOME ───────────────────────────────────────────────────────────────────
  renderHome() {
    const streak = DB.getCurrentStreak();
    const longest = DB.getLongestStreak();
    const todayDone = DB.todayDoseRecorded();
    const quote = DB.getTodaysQuote();
    const s = DB.getSettings();
    const name = s.userName;
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const displayName = name ? `, ${name}` : '';
    const progress = longest > 0 ? Math.min(streak / longest, 1) : (streak > 0 ? 1 : 0);
    const r = 80, cx = 100, cy = 100;
    const circ = 2 * Math.PI * r;
    const dash = progress * circ;

    document.getElementById('home-content').innerHTML = `
      <div class="screen-scroll">
        <!-- Greeting -->
        <div class="flex justify-between items-center mb-16">
          <div>
            <h1 style="font-size:22px;font-weight:400">${greeting}${displayName}</h1>
            <div class="text-muted mt-4" style="font-family:var(--font-mono);font-size:11px">
              ${new Date().toLocaleDateString('en', {weekday:'long',month:'long',day:'numeric'})}
            </div>
          </div>
          <div style="width:44px;height:44px;border-radius:50%;background:${todayDone?'var(--green-dim)':'var(--red-dim)'};border:1px solid ${todayDone?'var(--green-border)':'var(--red-border)'};display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">
            ${todayDone ? '✓' : '!'}
          </div>
        </div>

        <!-- Streak Ring -->
        <div class="streak-ring-wrap">
          <div style="position:relative;width:200px;height:200px">
            <svg class="ring-svg animate-glow" viewBox="0 0 200 200" width="200" height="200">
              <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--green-dim)" stroke-width="12"/>
              <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--green)" stroke-width="12"
                stroke-linecap="round"
                stroke-dasharray="${dash} ${circ - dash}"
                stroke-dashoffset="${circ * 0.25}"
                style="transition:stroke-dasharray 1.2s cubic-bezier(0.34,1.56,0.64,1)"/>
            </svg>
            <div class="ring-center">
              <div class="ring-number">${streak}</div>
              <div class="ring-label">sober days</div>
              ${longest > 0 && streak < longest ? `<div class="text-muted mt-4" style="font-size:10px">Best: ${longest}</div>` : ''}
            </div>
          </div>
        </div>

        <!-- Dose status banner -->
        <div class="card ${todayDone ? 'card-green' : 'card-red'} mb-12" ${!todayDone ? 'style="cursor:pointer" onclick="Router.go(\'checkin\')"' : ''}>
          <div class="flex items-center gap-12">
            <div style="width:38px;height:38px;border-radius:50%;background:${todayDone?'rgba(63,185,80,0.15)':'rgba(248,81,73,0.15)'};display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">
              ${todayDone ? '✓' : '!'}
            </div>
            <div style="flex:1">
              <div style="font-size:15px;font-weight:500;color:${todayDone?'var(--green-text)':'var(--red)'}">
                ${todayDone ? 'Dose recorded today' : 'Dose not yet recorded'}
              </div>
              <div style="font-size:12px;color:${todayDone?'var(--green-text)':'var(--red)'};opacity:0.7;margin-top:2px">
                ${todayDone ? 'Verification complete · Partner notified' : `Deadline: ${s.doseHour}:${String(s.doseMinute).padStart(2,'0')} — tap to record now`}
              </div>
            </div>
            ${!todayDone ? '<span style="color:var(--red);opacity:0.6;font-size:18px">→</span>' : ''}
          </div>
        </div>

        <!-- Daily quote -->
        <div class="quote-card mb-12">
          <div class="label label-blue mb-8">Daily reflection</div>
          <div class="quote-text">"${quote.text}"</div>
          <div class="quote-author">— ${quote.author}</div>
        </div>

        <!-- Stats row -->
        <div class="stats-grid mb-12">
          <div class="stat-card">
            <div class="stat-val">${streak}</div>
            <div class="stat-unit">days</div>
            <div class="stat-lbl">Current<br>streak</div>
          </div>
          <div class="stat-card">
            <div class="stat-val">${longest}</div>
            <div class="stat-unit">days</div>
            <div class="stat-lbl">Longest<br>streak</div>
          </div>
          <div class="stat-card">
            <div class="stat-val">${DB.getTotalDoses()}</div>
            <div class="stat-unit">doses</div>
            <div class="stat-lbl">Total<br>recorded</div>
          </div>
        </div>

        <!-- Calendar heatmap (5 weeks) -->
        <div class="card mb-12">
          <div class="label mb-8">30-day calendar</div>
          ${this._renderHeatmap(DB.getCalendarDays(5))}
        </div>

        <!-- Quick actions -->
        <div class="label mb-8">Quick actions</div>
        <div class="card ${todayDone?'card-green':''} mb-8" style="cursor:pointer" onclick="Router.go('checkin')">
          <div class="flex items-center gap-12">
            <span style="font-size:22px">${todayDone?'✓':'💊'}</span>
            <div>
              <div style="font-size:14px;font-weight:500;color:${todayDone?'var(--green-text)':'var(--text-primary)'}">
                ${todayDone ? 'Dose recorded' : "Record today's dose"}
              </div>
              <div class="text-secondary" style="font-size:11px;margin-top:2px">
                ${todayDone ? 'Tap to view verification' : 'Disulfiram · Video observed therapy'}
              </div>
            </div>
          </div>
        </div>
        <div class="flex gap-8">
          <div class="card flex-1 mb-0" style="cursor:pointer" onclick="Router.go('partner')">
            <div style="font-size:22px;margin-bottom:4px">📍</div>
            <div style="font-size:13px;font-weight:500">GPS</div>
            <div class="text-muted" style="font-size:11px">${s.gpsEnabled?'Active':'Off'}</div>
          </div>
          <div class="card flex-1 mb-0" style="cursor:pointer" onclick="Router.go('partner')">
            <div style="font-size:22px;margin-bottom:4px">👥</div>
            <div style="font-size:13px;font-weight:500">Partner</div>
            <div class="text-muted" style="font-size:11px">View log</div>
          </div>
        </div>
      </div>
    `;
  },

  _renderHeatmap(days) {
    const dayLabels = ['M','T','W','T','F','S','S'];
    const headers = dayLabels.map(d => `<span>${d}</span>`).join('');
    const cells = days.map(d => {
      let cls = 'heatmap-cell';
      if (d.done)   cls += ' done';
      else if (d.missed) cls += ' missed';
      if (d.isToday) cls += ' today';
      return `<div class="${cls}">${d.dayNum}</div>`;
    }).join('');
    return `
      <div class="heatmap-header">${headers}</div>
      <div class="heatmap">${cells}</div>
      <div class="divider"></div>
      <div class="flex gap-12" style="flex-wrap:wrap">
        <div class="flex items-center gap-8"><div style="width:10px;height:10px;border-radius:2px;background:var(--green-dim);border:1px solid var(--green-border)"></div><span class="text-muted">Recorded</span></div>
        <div class="flex items-center gap-8"><div style="width:10px;height:10px;border-radius:2px;background:var(--red-dim);border:1px solid var(--red-border)"></div><span class="text-muted">Missed</span></div>
      </div>`;
  },

  // ── CHECK-IN ───────────────────────────────────────────────────────────────
  renderCheckin() {
    document.getElementById('checkin-content').innerHTML = `
      <div class="screen-scroll">
        <div class="label label-blue mb-8">Video observed therapy</div>
        <h1 style="font-size:22px;font-weight:400;margin-bottom:4px">Record today's dose</h1>
        <div class="text-secondary mb-16">Hold pill in view · Place on tongue · Open mouth to confirm</div>

        <!-- Camera frame -->
        <div class="camera-wrap" id="camera-wrap">
          <video id="camera-video" autoplay playsinline muted style="display:none"></video>
          <canvas id="camera-canvas" style="display:none"></canvas>
          <div id="camera-placeholder" style="display:flex;flex-direction:column;align-items:center;gap:10px;color:var(--text-muted)">
            <div style="font-size:48px">📷</div>
            <div style="font-size:13px">Tap button below to start</div>
          </div>
          <div class="camera-corner corner-tl"></div>
          <div class="camera-corner corner-tr"></div>
          <div class="camera-corner corner-bl"></div>
          <div class="camera-corner corner-br"></div>
          <div class="rec-badge" id="rec-badge"><div class="rec-dot"></div>REC</div>
          <div class="camera-overlay">
            <div class="prompt-banner" id="prompt-banner" style="display:none"></div>
          </div>
        </div>

        <!-- AI verification checklist -->
        <div class="card mb-12">
          <div class="label mb-8">AI verification</div>
          <div class="step-row" id="step-0">
            <div class="step-dot" id="dot-0"></div>
            <span>Pill visible in frame</span>
            <span class="step-check" id="check-0"></span>
          </div>
          <div class="step-row" id="step-1">
            <div class="step-dot" id="dot-1"></div>
            <span>Swallowing confirmed</span>
            <span class="step-check" id="check-1"></span>
          </div>
          <div class="step-row" id="step-2">
            <div class="step-dot" id="dot-2"></div>
            <span>Timestamp verified</span>
            <span class="step-check" id="check-2"></span>
          </div>
          <div class="step-row" id="step-3">
            <div class="step-dot" id="dot-3"></div>
            <span>Photo sent to partner</span>
            <span class="step-check" id="check-3"></span>
          </div>
        </div>

        <!-- Record button -->
        <button class="btn btn-primary btn-lg" id="record-btn" onclick="App.toggleRecording()">
          Begin verification recording
        </button>

        <!-- Result card (hidden until done) -->
        <div id="result-card" style="display:none;margin-top:12px"></div>
      </div>
    `;
    App.initCamera();
  },

  // ── PARTNER / GPS ──────────────────────────────────────────────────────────
  renderPartner() {
    const s = DB.getSettings();
    const log = DB.getPartnerLog();
    document.getElementById('partner-content').innerHTML = `
      <div class="screen-scroll">
        <div class="label label-blue mb-8">Accountability</div>
        <h1 style="font-size:22px;font-weight:400;margin-bottom:16px">Partner & GPS</h1>

        <!-- Partner info card -->
        <div class="card mb-12">
          <div class="label mb-8">Accountability partner</div>
          ${s.partnerName ? `
            <div class="flex items-center gap-12">
              <div style="width:44px;height:44px;border-radius:50%;background:var(--blue-dim);border:1px solid #1a3a5c;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:500;color:var(--blue)">
                ${s.partnerName.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style="font-size:15px;font-weight:500">${s.partnerName}</div>
                <div class="text-muted" style="font-size:11px">${s.partnerPhone || 'No phone set'}</div>
              </div>
              <div style="margin-left:auto">
                <div style="padding:3px 10px;border-radius:20px;background:var(--green-dim);border:1px solid var(--green-border);font-size:10px;color:var(--green-text);font-family:var(--font-mono)">ACTIVE</div>
              </div>
            </div>` :
            `<div class="text-secondary" style="font-size:13px">No partner set. <span style="color:var(--blue);cursor:pointer" onclick="Router.go('settings')">Add in Settings →</span></div>`
          }
        </div>

        <!-- GPS monitoring -->
        <div class="card mb-12">
          <div class="flex justify-between items-center mb-12">
            <div>
              <div class="label mb-4">GPS monitoring</div>
              <div class="text-secondary" style="font-size:12px">${s.gpsEnabled ? `Active · ${s.gpsRadius}m radius` : 'Off — enable to get proximity alerts'}</div>
            </div>
            <label class="toggle">
              <input type="checkbox" id="gps-toggle" ${s.gpsEnabled?'checked':''} onchange="App.toggleGps(this.checked)">
              <span class="toggle-slider"></span>
            </label>
          </div>

          <!-- Map placeholder -->
          <div class="map-placeholder">
            <div class="map-grid"></div>
            <div class="map-you"></div>
            <div class="map-store" style="top:36%;left:62%"></div>
            <div class="map-zone" style="top:26%;left:51%"></div>
            <div class="map-store" style="top:68%;left:30%"></div>
            <div style="position:absolute;bottom:10px;left:10px;display:flex;gap:12px;background:rgba(13,17,23,0.7);border-radius:6px;padding:6px 10px">
              <div class="flex items-center gap-8" style="font-size:10px;color:var(--text-secondary)"><div style="width:8px;height:8px;border-radius:50%;background:var(--green);flex-shrink:0"></div>You</div>
              <div class="flex items-center gap-8" style="font-size:10px;color:var(--text-secondary)"><div style="width:8px;height:8px;border-radius:50%;background:var(--red);flex-shrink:0"></div>Liquor stores</div>
            </div>
          </div>

          <div class="divider"></div>
          <div class="flex justify-between items-center mb-8">
            <span class="text-secondary" style="font-size:13px">Alert radius</span>
            <span style="color:var(--amber-text);font-family:var(--font-mono);font-size:13px">${s.gpsRadius}m</span>
          </div>
          <input type="range" class="range-input" min="100" max="1000" step="100" value="${s.gpsRadius}"
            oninput="App.updateRadius(this.value)" onchange="App.saveRadius(this.value)">
          <div class="range-labels"><span>100m</span><span>1000m</span></div>
        </div>

        <!-- Alert log -->
        <div class="label mb-8">Recent notifications sent</div>
        ${log.length === 0 ? `<div class="card"><div class="text-muted text-center" style="font-size:13px;padding:8px 0">No notifications yet</div></div>` :
          log.slice(0, 10).map(e => `
            <div class="card card-sm mb-8">
              <div class="flex items-center gap-8">
                <span style="font-size:16px">${e.type==='dose'?'✅':e.type==='missed'?'⚠️':'📍'}</span>
                <div style="flex:1;min-width:0">
                  <div style="font-size:12px;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.msg}</div>
                  <div class="text-muted" style="font-size:10px;margin-top:2px">${new Date(e.ts).toLocaleString()}</div>
                </div>
              </div>
            </div>`).join('')
        }
      </div>
    `;
  },

  // ── PROGRESS ───────────────────────────────────────────────────────────────
  renderProgress() {
    const streak = DB.getCurrentStreak();
    const longest = DB.getLongestStreak();
    const total = DB.getTotalDoses();
    const missed = DB.getTotalMissed();
    const rate = DB.getComplianceRate();
    const bars = DB.getWeekBars();
    const milestones = DB.getMilestones(streak);
    const clock = DB.getSobrietyClock();
    const calDays = DB.getCalendarDays(5);
    const pct = Math.round(rate * 100);
    const r = 42, circ = 2 * Math.PI * r;
    const dash = rate * circ;
    const ringColor = pct >= 90 ? 'var(--green)' : pct >= 70 ? 'var(--amber-text)' : 'var(--red)';

    document.getElementById('progress-content').innerHTML = `
      <div class="screen-scroll">
        <div class="label label-blue mb-8">Analytics</div>
        <h1 style="font-size:22px;font-weight:400;margin-bottom:16px">Your progress</h1>

        <!-- Summary stats -->
        <div class="stats-grid mb-12">
          <div class="stat-card"><div class="stat-val" style="color:var(--green-text)">${streak}</div><div class="stat-unit">days</div><div class="stat-lbl">Current<br>streak</div></div>
          <div class="stat-card"><div class="stat-val" style="color:var(--blue)">${longest}</div><div class="stat-unit">days</div><div class="stat-lbl">Longest<br>streak</div></div>
          <div class="stat-card"><div class="stat-val" style="color:${missed===0?'var(--green-text)':'var(--amber-text)'}">${missed}</div><div class="stat-unit">days</div><div class="stat-lbl">Missed<br>doses</div></div>
        </div>

        <!-- Compliance ring -->
        <div class="card mb-12">
          <div class="label mb-12">Dose compliance</div>
          <div class="compliance-wrap">
            <div class="compliance-ring-wrap">
              <svg viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--green-dim)" stroke-width="10"/>
                <circle cx="50" cy="50" r="${r}" fill="none" stroke="${ringColor}" stroke-width="10"
                  stroke-linecap="round"
                  stroke-dasharray="${dash.toFixed(1)} ${(circ-dash).toFixed(1)}"
                  stroke-dashoffset="${(circ*0.25).toFixed(1)}"
                  style="transition:stroke-dasharray 1s ease"/>
              </svg>
              <div class="compliance-center">
                <div class="compliance-pct" style="color:${ringColor}">${pct}%</div>
                <div class="compliance-lbl">rate</div>
              </div>
            </div>
            <div>
              <div style="font-size:16px;font-weight:500;margin-bottom:6px">${total} doses recorded</div>
              <div class="text-secondary" style="font-size:13px">
                ${pct>=95?'Outstanding consistency 🌟':pct>=85?'Great work — keep it up 💪':pct>=70?'Good progress — stay focused':'Every day is a fresh start'}
              </div>
            </div>
          </div>
        </div>

        <!-- Weekly bar chart -->
        <div class="card mb-12">
          <div class="label mb-12">Weekly doses recorded</div>
          <div class="bar-chart">
            ${bars.map(b => {
              const ht = b.total > 0 ? Math.round((b.done / b.total) * 100) : 0;
              const cls = b.done === b.total ? 'bar-fill perfect' : b.done === 0 ? 'bar-fill missed' : 'bar-fill';
              return `<div class="bar-col">
                <div class="${cls}" style="height:${ht}%;min-height:4px"></div>
                <div class="bar-lbl">${b.label}</div>
                <div class="bar-lbl">${b.done}/${b.total}</div>
              </div>`;
            }).join('')}
          </div>
          <div class="divider"></div>
          <div class="flex gap-12">
            <div class="flex items-center gap-8"><div style="width:8px;height:8px;border-radius:2px;background:var(--green);"></div><span class="text-muted">Perfect week</span></div>
            <div class="flex items-center gap-8"><div style="width:8px;height:8px;border-radius:2px;background:var(--green-dim);border:1px solid var(--green-border)"></div><span class="text-muted">Partial</span></div>
          </div>
        </div>

        <!-- Milestones -->
        <div class="label mb-8">Milestones</div>
        <div class="milestone-grid mb-12">
          ${milestones.map(m => `
            <div class="milestone-card ${m.achieved?'achieved':''}">
              <div class="milestone-icon">${m.icon}</div>
              <div class="milestone-days">${m.days} days</div>
              <div class="milestone-name">${m.label}</div>
              ${!m.achieved ? '<div style="font-size:12px;margin-top:4px;color:var(--text-muted)">🔒</div>' : ''}
            </div>`).join('')}
        </div>

        <!-- Calendar heatmap -->
        <div class="card mb-12">
          <div class="label mb-8">30-day calendar</div>
          ${this._renderHeatmap(calDays)}
        </div>

        <!-- Sobriety clock -->
        ${clock ? `
        <div class="card mb-12">
          <div class="label mb-12">Sobriety clock</div>
          <div class="sober-clock">
            ${clock.years > 0 ? `<div class="clock-unit"><div class="clock-val">${clock.years}</div><div class="clock-lbl">${clock.years===1?'year':'years'}</div></div>` : ''}
            ${(clock.months > 0 || clock.years > 0) ? `<div class="clock-unit"><div class="clock-val">${clock.months}</div><div class="clock-lbl">${clock.months===1?'month':'months'}</div></div>` : ''}
            <div class="clock-unit"><div class="clock-val">${clock.days}</div><div class="clock-lbl">${clock.days===1?'day':'days'}</div></div>
          </div>
          <div class="text-center text-muted mt-8" style="font-size:12px">Since ${new Date(clock.startDate+'T00:00:00').toLocaleDateString('en',{month:'long',day:'numeric',year:'numeric'})}</div>
        </div>` : ''}

        <!-- Export button -->
        <button class="btn btn-ghost" onclick="App.exportReport()">📄 Export progress report</button>
        <div style="height:8px"></div>
      </div>
    `;
  },

  // ── SETTINGS ───────────────────────────────────────────────────────────────
  renderSettings() {
    const s = DB.getSettings();
    document.getElementById('settings-content').innerHTML = `
      <div class="screen-scroll">
        <div class="label label-blue mb-8">Preferences</div>
        <h1 style="font-size:22px;font-weight:400;margin-bottom:16px">Settings</h1>

        <!-- Profile -->
        <div class="settings-section">
          <div class="settings-section-title">Profile</div>
          <div class="input-group">
            <label>Your first name</label>
            <input class="input" id="set-name" value="${s.userName}" placeholder="e.g. Alex">
          </div>
          <div class="input-group">
            <label>Sobriety start date</label>
            <input class="input" id="set-sobriety-date" type="date" value="${s.sobrietyDate}">
          </div>
        </div>

        <!-- Dose schedule -->
        <div class="settings-section">
          <div class="settings-section-title">Dose schedule</div>
          <div class="input-group">
            <label>Daily dose deadline</label>
            <input class="input" id="set-dose-time" type="time" value="${String(s.doseHour).padStart(2,'0')}:${String(s.doseMinute).padStart(2,'0')}">
          </div>
          <div class="toggle-row">
            <div class="toggle-info">
              <div class="toggle-title">Daily reminder</div>
              <div class="toggle-sub">Notify before your deadline</div>
            </div>
            <label class="toggle">
              <input type="checkbox" id="set-reminder" ${s.reminderEnabled?'checked':''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="input-group" style="margin-top:8px">
            <label>Remind me <span id="reminder-val">${s.reminderMinutesBefore}</span> minutes before deadline</label>
            <input type="range" class="range-input" min="5" max="120" step="5" value="${s.reminderMinutesBefore}"
              oninput="document.getElementById('reminder-val').textContent=this.value" id="set-reminder-mins">
          </div>
        </div>

        <!-- AI Verification -->
        <div class="settings-section">
          <div class="settings-section-title">AI Verification</div>
          <div class="text-secondary mb-12" style="font-size:12px">Confidence threshold — recordings scoring below this are rejected</div>
          ${[
            {val:70,  label:'Lenient (70%)',  desc:'Good for building the habit — less strict'},
            {val:82,  label:'Standard (82%)', desc:'Recommended — clear recordings required'},
            {val:92,  label:'Strict (92%)',   desc:'Maximum accountability — very strict'},
          ].map(t => `
            <div class="threshold-option ${s.threshold===t.val?'selected':''}" onclick="App.selectThreshold(${t.val},this)">
              <div class="threshold-radio"></div>
              <div class="threshold-text">
                <h4>${t.label}</h4>
                <p>${t.desc}</p>
              </div>
            </div>`).join('')}

        </div>

        <!-- Partner -->
        <div class="settings-section">
          <div class="settings-section-title">Accountability partner</div>
          <div class="input-group">
            <label>Partner's name</label>
            <input class="input" id="set-partner-name" value="${s.partnerName}" placeholder="e.g. Sarah">
          </div>
          <div class="input-group">
            <label>Partner's phone number</label>
            <input class="input" id="set-partner-phone" type="tel" value="${s.partnerPhone}" placeholder="+1 604 555 0100">
          </div>
          <div class="divider"></div>
          <div class="text-muted mb-8" style="font-size:11px;font-weight:500">Notify partner when:</div>
          <div class="toggle-row">
            <div class="toggle-info"><div class="toggle-title">Dose is recorded</div><div class="toggle-sub">Photo + confirmation SMS</div></div>
            <label class="toggle"><input type="checkbox" id="set-notify-dose" ${s.notifyDose?'checked':''}><span class="toggle-slider"></span></label>
          </div>
          <div class="toggle-row">
            <div class="toggle-info"><div class="toggle-title">Dose is missed</div><div class="toggle-sub">Alert if not recorded by deadline</div></div>
            <label class="toggle"><input type="checkbox" id="set-notify-missed" ${s.notifyMissed?'checked':''}><span class="toggle-slider"></span></label>
          </div>
          <div class="toggle-row">
            <div class="toggle-info"><div class="toggle-title">Near a liquor store</div><div class="toggle-sub">GPS proximity alert</div></div>
            <label class="toggle"><input type="checkbox" id="set-notify-gps" ${s.notifyGps?'checked':''}><span class="toggle-slider"></span></label>
          </div>
        </div>

        <!-- GPS -->
        <div class="settings-section">
          <div class="settings-section-title">GPS monitoring</div>
          <div class="toggle-row">
            <div class="toggle-info"><div class="toggle-title">Enable GPS monitoring</div><div class="toggle-sub">${s.gpsEnabled?'Active — liquor stores monitored':'Off — tap to enable'}</div></div>
            <label class="toggle"><input type="checkbox" id="set-gps" ${s.gpsEnabled?'checked':''} onchange="App.requestLocationPerm(this.checked)"><span class="toggle-slider"></span></label>
          </div>
          <div class="input-group mt-8">
            <label>Alert radius: <span id="gps-radius-val">${s.gpsRadius}</span>m</label>
            <input type="range" class="range-input" min="100" max="1000" step="100" value="${s.gpsRadius}"
              oninput="document.getElementById('gps-radius-val').textContent=this.value" id="set-gps-radius">
            <div class="range-labels"><span>100m</span><span>1000m</span></div>
          </div>
        </div>

        <!-- Save -->
        <button class="btn btn-primary btn-lg mb-12" onclick="App.saveSettings()">Save settings</button>
        <button class="btn btn-danger" onclick="App.confirmReset()">Reset all data</button>
        <div style="height:24px"></div>
      </div>
    `;
  }
};

// ── App logic ─────────────────────────────────────────────────────────────────
const App = {
  mediaRecorder: null,
  recordedChunks: [],
  recording: false,
  stream: null,
  recordingTimer: null,
  selectedThreshold: null,

  async initCamera() {
    // Camera starts only on button press to avoid premature permission prompts
  },

  async startCamera() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      });
      const video = document.getElementById('camera-video');
      video.srcObject = this.stream;
      video.style.display = 'block';
      document.getElementById('camera-placeholder').style.display = 'none';
    } catch(e) {
      showToast('Camera access denied — please allow camera in browser settings');
      console.error(e);
    }
  },

  stopCamera() {
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
    const video = document.getElementById('camera-video');
    if (video) { video.style.display = 'none'; video.srcObject = null; }
    const ph = document.getElementById('camera-placeholder');
    if (ph) ph.style.display = 'flex';
  },

  async toggleRecording() {
    if (this.recording) {
      this.stopRecording();
    } else {
      if (!this.stream) await this.startCamera();
      if (!this.stream) return;
      this.startRecording();
    }
  },

  startRecording() {
    this.recording = true;
    this.recordedChunks = [];
    const video = document.getElementById('camera-video');
    const btn = document.getElementById('record-btn');
    const badge = document.getElementById('rec-badge');
    const banner = document.getElementById('prompt-banner');

    btn.textContent = '⏹ Stop recording';
    btn.classList.add('btn-danger');
    btn.classList.remove('btn-primary');
    badge.classList.add('active');
    banner.style.display = 'block';

    const prompts = [
      'Hold pill clearly in front of camera',
      'Place pill on your tongue',
      'Swallow — then open mouth wide to show it\'s gone'
    ];
    let phase = 0;
    banner.textContent = prompts[phase];

    this.recordingTimer = setInterval(() => {
      phase = Math.min(phase + 1, prompts.length - 1);
      banner.textContent = prompts[phase];
    }, 5000);

    try {
      this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: 'video/webm' });
      this.mediaRecorder.ondataavailable = e => { if (e.data.size > 0) this.recordedChunks.push(e.data); };
      this.mediaRecorder.onstop = () => this.processRecording();
      this.mediaRecorder.start();

      // Auto-stop after 18 seconds
      setTimeout(() => { if (this.recording) this.stopRecording(); }, 18000);
    } catch(e) {
      showToast('Recording not supported in this browser');
      this.recording = false;
    }
  },

  stopRecording() {
    this.recording = false;
    clearInterval(this.recordingTimer);
    const btn = document.getElementById('record-btn');
    const badge = document.getElementById('rec-badge');
    const banner = document.getElementById('prompt-banner');
    if (btn) { btn.textContent = 'Analysing…'; btn.disabled = true; }
    if (badge) badge.classList.remove('active');
    if (banner) { banner.textContent = 'Processing recording…'; }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
  },

  async processRecording() {
    const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);

    // Create hidden video to extract frames
    const video = document.createElement('video');
    video.src = url;
    video.muted = true;
    await new Promise(r => { video.onloadeddata = r; video.load(); });

    // Step 1: extract frames
    this._setStep(0, 'checking');

    const frames = [];
    for (const t of [2, 7, 13]) {
      const f = await AI.extractFrameFromVideo(video, t);
      frames.push(f);
    }
    URL.revokeObjectURL(url);
    this._setStep(0, 'done');

    // Step 2: AI verification via server function (no API key needed by user)
    this._setStep(1, 'checking');
    let result;
    try {
      result = await AI.verifyFrames(frames);
    } catch(e) {
      this._setStep(1, 'failed');
      this._showResult(false, 'AI verification error: ' + e.message, 0);
      this._resetBtn();
      return;
    }

    const s = DB.getSettings();
    const avgConf = Math.round(
      (result.pill_visible.confidence + result.ingestion_shown.confidence + result.mouth_clear.confidence) / 3
    );
    const passed = result.overall_pass && avgConf >= s.threshold;

    this._setStep(1, passed ? 'done' : 'failed');

    if (!passed) {
      this._setStep(2, 'failed');
      this._setStep(3, 'failed');
      const reasons = (result.flags || []).map(f => ({
        poor_lighting: 'Lighting too dark — move to a brighter area',
        face_not_visible: 'Your face must be visible throughout',
        no_pill_detected: 'No pill detected — hold it clearly to the camera first',
        possible_pre_recorded: 'Video appears pre-recorded — record in real time',
        hand_obscuring_mouth: 'Keep your hand clear of your mouth',
      }[f] || f)).join('\n');
      this._showResult(false, reasons || 'Verification did not pass. Please re-record in good lighting.', avgConf);
      this._resetBtn();
      return;
    }

    // Step 2: record dose
    this._setStep(2, 'checking');
    const streak = DB.recordDose({ confidence: avgConf, passed: true });
    this._setStep(2, 'done');

    // Step 3: notify partner
    this._setStep(3, 'checking');
    await Notif.sendPartnerSMS('dose', { streak, confidence: avgConf });
    Notif.show('✅ Dose verified!', `Day ${streak} — partner notified. Confidence: ${avgConf}%`);
    this._setStep(3, 'done');

    this._showResult(true, '', avgConf, streak);
    this._resetBtn();
    this.stopCamera();

    // Refresh home tab data
    if (Router.current === 'checkin') {
      setTimeout(() => Screens.renderHome(), 500);
    }
  },

  _setStep(i, state) {
    const dot = document.getElementById(`dot-${i}`);
    const check = document.getElementById(`check-${i}`);
    if (!dot) return;
    dot.className = 'step-dot ' + state;
    check.textContent = state === 'done' ? '✓' : state === 'failed' ? '✗' : '';
    check.style.color = state === 'done' ? 'var(--green-text)' : state === 'failed' ? 'var(--red)' : '';
  },

  _showResult(passed, reason, confidence, streak = 0) {
    const card = document.getElementById('result-card');
    if (!card) return;
    card.style.display = 'block';
    if (passed) {
      card.innerHTML = `
        <div class="card card-green animate-slide-up">
          <div style="font-size:36px;text-align:center;margin-bottom:8px">✅</div>
          <h2 style="text-align:center;color:var(--green-text);font-size:20px;margin-bottom:4px">Dose verified!</h2>
          <div class="text-center text-secondary" style="font-size:13px">Confidence: ${confidence}% · Day ${streak} streak<br>Photo sent to your partner.</div>
        </div>`;
    } else {
      card.innerHTML = `
        <div class="card card-red animate-slide-up">
          <div style="font-size:36px;text-align:center;margin-bottom:8px">❌</div>
          <h2 style="text-align:center;color:var(--red);font-size:18px;margin-bottom:8px">Verification failed</h2>
          <div style="font-size:13px;color:#f4a0a0;line-height:1.6;white-space:pre-line">${reason}</div>
        </div>`;
    }
  },

  _resetBtn() {
    const btn = document.getElementById('record-btn');
    if (!btn) return;
    btn.textContent = 'Try again';
    btn.disabled = false;
    btn.classList.remove('btn-danger');
    btn.classList.add('btn-primary');
  },

  // ── GPS ────────────────────────────────────────────────────────────────────
  async toggleGps(enabled) {
    if (enabled) {
      const ok = await this.requestLocationPerm(true);
      if (!ok) {
        document.getElementById('gps-toggle').checked = false;
        return;
      }
    }
    const s = DB.getSettings();
    s.gpsEnabled = enabled;
    DB.saveSettings(s);
    if (enabled) Notif.startGpsMonitoring();
    else Notif.stopGpsMonitoring();
    showToast(enabled ? '📍 GPS monitoring active' : 'GPS monitoring off');
  },

  async requestLocationPerm(enable) {
    if (!navigator.geolocation) {
      showToast('GPS not supported in this browser');
      return false;
    }
    return new Promise(resolve => {
      navigator.geolocation.getCurrentPosition(
        () => resolve(true),
        () => { showToast('Location permission denied'); resolve(false); }
      );
    });
  },

  updateRadius(val) {
    const label = document.getElementById('gps-radius-val') || document.querySelector('[id*="radius-val"]');
    if (label) label.textContent = val;
  },

  saveRadius(val) {
    const s = DB.getSettings();
    s.gpsRadius = parseInt(val);
    DB.saveSettings(s);
  },

  // ── Settings ───────────────────────────────────────────────────────────────
  selectThreshold(val, el) {
    document.querySelectorAll('.threshold-option').forEach(o => o.classList.remove('selected'));
    el.classList.add('selected');
    this.selectedThreshold = val;
  },

  saveSettings() {
    const timeVal = document.getElementById('set-dose-time').value;
    const [h, m] = timeVal ? timeVal.split(':').map(Number) : [9, 0];
    const s = {
      ...DB.getSettings(),
      userName: document.getElementById('set-name').value.trim(),
      sobrietyDate: document.getElementById('set-sobriety-date').value,
      doseHour: h, doseMinute: m,
      threshold: this.selectedThreshold || DB.getSettings().threshold,
      partnerName: document.getElementById('set-partner-name').value.trim(),
      partnerPhone: document.getElementById('set-partner-phone').value.trim(),
      gpsEnabled: document.getElementById('set-gps').checked,
      gpsRadius: parseInt(document.getElementById('set-gps-radius').value),
      notifyDose: document.getElementById('set-notify-dose').checked,
      notifyMissed: document.getElementById('set-notify-missed').checked,
      notifyGps: document.getElementById('set-notify-gps').checked,
      reminderEnabled: document.getElementById('set-reminder').checked,
      reminderMinutesBefore: parseInt(document.getElementById('set-reminder-mins').value),
    };
    DB.saveSettings(s);
    Notif.scheduleDoseReminder();
    Notif.scheduleMissedDoseCheck();
    if (s.gpsEnabled) Notif.startGpsMonitoring();
    else Notif.stopGpsMonitoring();
    showToast('✓ Settings saved');
  },

  confirmReset() {
    if (confirm('Reset ALL data? This will erase your streak, doses, and settings. This cannot be undone.')) {
      DB.resetAllData();
      showToast('All data reset');
      setTimeout(() => location.reload(), 1000);
    }
  },

  exportReport() {
    const streak = DB.getCurrentStreak();
    const total = DB.getTotalDoses();
    const missed = DB.getTotalMissed();
    const rate = Math.round(DB.getComplianceRate() * 100);
    const s = DB.getSettings();
    const name = s.userName || 'Patient';
    const date = new Date().toLocaleDateString('en', {year:'numeric',month:'long',day:'numeric'});
    const report = `SOBERTRACK PROGRESS REPORT
Generated: ${date}
Patient: ${name}

SUMMARY
Current streak: ${streak} days
Longest streak: ${DB.getLongestStreak()} days
Total doses recorded: ${total}
Missed doses: ${missed}
Compliance rate: ${rate}%
Sobriety start date: ${s.sobrietyDate || 'Not set'}

MILESTONES ACHIEVED
${DB.getMilestones(streak).filter(m => m.achieved).map(m => `✓ ${m.label} (${m.days} days)`).join('\n')}

---
Generated by SoberTrack — Video Observed Therapy companion app
`;
    const blob = new Blob([report], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `SoberTrack_Report_${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    showToast('📄 Report downloaded');
  }
};

// ── Onboarding ─────────────────────────────────────────────────────────────────
const Onboarding = {
  step: 0,
  data: {},
  steps: ['welcome','name','date','time','partner','perms','done'],

  render() {
    document.getElementById('app-shell').style.display = 'none';
    document.getElementById('onboarding').style.display = 'flex';
    this.renderStep();
  },

  renderStep() {
    const s = this.step;
    const total = this.steps.length;
    const dots = this.steps.map((_,i) =>
      `<div class="step-dot-ob ${i===s?'active':i<s?'done':''}"></div>`
    ).join('');

    const contents = {
      welcome: `
        <div style="text-align:center;padding:20px 0">
          <div style="font-size:72px;margin-bottom:20px">💚</div>
          <h1 style="font-size:28px;font-weight:300;margin-bottom:12px;line-height:1.2">Welcome to<br>SoberTrack</h1>
          <p class="text-secondary" style="margin-bottom:28px;line-height:1.6">Your personal Video Observed Therapy companion for Disulfiram accountability. Every day you record your dose, your streak grows.</p>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${[['💊','AI-verified daily dose recording'],['📍','GPS alerts near liquor stores'],['👥','Automatic accountability partner updates'],['📊','Streak tracking & milestone badges']].map(([i,t])=>
              `<div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);text-align:left">
                <span style="font-size:20px">${i}</span><span class="text-secondary" style="font-size:14px">${t}</span>
              </div>`).join('')}
          </div>
        </div>`,
      name: `
        <h1 style="margin-bottom:8px">Your first name</h1>
        <p class="text-secondary mb-16">We'll use this in notifications to your partner.</p>
        <div class="input-group">
          <label>First name</label>
          <input class="input" id="ob-name" value="${this.data.userName||''}" placeholder="e.g. Alex" style="font-size:18px;padding:14px">
        </div>`,
      date: `
        <h1 style="margin-bottom:8px">Sobriety start date</h1>
        <p class="text-secondary mb-16">When did your current recovery journey begin?</p>
        <div class="input-group">
          <label>Start date</label>
          <input class="input" id="ob-date" type="date" value="${this.data.sobrietyDate||''}" style="font-size:16px;padding:14px">
        </div>
        <p class="text-muted" style="font-size:12px;margin-top:8px">Leave blank to count from your first recorded dose. You can always update this in Settings.</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:16px">
          ${[['Today', new Date().toISOString().split('T')[0]],
             ['Yesterday', new Date(Date.now()-86400000).toISOString().split('T')[0]],
             ['1 week ago', new Date(Date.now()-7*86400000).toISOString().split('T')[0]],
             ['1 month ago', new Date(Date.now()-30*86400000).toISOString().split('T')[0]]
          ].map(([l,v])=>`<button class="btn btn-ghost" style="padding:10px" onclick="document.getElementById('ob-date').value='${v}'">${l}</button>`).join('')}
        </div>`,
      time: `
        <h1 style="margin-bottom:8px">Daily dose time</h1>
        <p class="text-secondary mb-16">What time do you take your Disulfiram each day?</p>
        <div class="input-group">
          <label>Dose deadline</label>
          <input class="input" id="ob-time" type="time" value="${String(this.data.doseHour||9).padStart(2,'0')}:${String(this.data.doseMinute||0).padStart(2,'0')}" style="font-size:20px;padding:14px;text-align:center">
        </div>
        <p class="text-muted" style="font-size:12px;margin-top:8px">If not recorded by this time, you and your partner will be notified.</p>`,
      partner: `
        <h1 style="margin-bottom:8px">Accountability partner</h1>
        <p class="text-secondary mb-16">Who should receive your daily dose photo and alerts?</p>
        <div class="input-group">
          <label>Partner's name</label>
          <input class="input" id="ob-partner-name" value="${this.data.partnerName||''}" placeholder="e.g. Sarah" style="font-size:16px;padding:14px">
        </div>
        <div class="input-group">
          <label>Partner's phone number</label>
          <input class="input" id="ob-partner-phone" type="tel" value="${this.data.partnerPhone||''}" placeholder="+1 604 555 0100" style="font-size:16px;padding:14px">
        </div>
        <div class="card mt-12">
          <div class="text-muted mb-8" style="font-size:11px;font-weight:500">Your partner will receive:</div>
          ${[['📸','A photo when you record your dose'],['✅','Daily SMS confirming your streak'],['⚠️','An alert if you miss your deadline'],['📍','A GPS alert if you\'re near a liquor store']].map(([i,t])=>`<div style="display:flex;gap:10px;align-items:center;margin-bottom:8px"><span>${i}</span><span class="text-secondary" style="font-size:13px">${t}</span></div>`).join('')}
        </div>`,
      perms: `
        <h1 style="margin-bottom:8px">Permissions</h1>
        <p class="text-secondary mb-16">SoberTrack needs these to work properly.</p>
        <div id="ob-perm-camera" class="perm-row ${this.data.cameraGranted?'granted':''}">
          <div class="perm-icon">📷</div>
          <div class="perm-info"><div class="perm-title">Camera</div><div class="perm-desc">To record your daily dose video</div></div>
          ${this.data.cameraGranted ? '<div class="perm-check">✓</div>' : '<button class="perm-btn" onclick="Onboarding.grantCamera()">Allow</button>'}
        </div>
        <div id="ob-perm-notif" class="perm-row ${this.data.notifGranted?'granted':''}">
          <div class="perm-icon">🔔</div>
          <div class="perm-info"><div class="perm-title">Notifications</div><div class="perm-desc">For dose reminders and proximity alerts</div></div>
          ${this.data.notifGranted ? '<div class="perm-check">✓</div>' : '<button class="perm-btn" onclick="Onboarding.grantNotif()">Allow</button>'}
        </div>
        <div id="ob-perm-location" class="perm-row ${this.data.locationGranted?'granted':''}">
          <div class="perm-icon">📍</div>
          <div class="perm-info"><div class="perm-title">Location</div><div class="perm-desc">To alert your partner if you're near a liquor store</div></div>
          ${this.data.locationGranted ? '<div class="perm-check">✓</div>' : '<button class="perm-btn" onclick="Onboarding.grantLocation()">Allow</button>'}
        </div>`,
      done: `
        <div style="text-align:center;padding:20px 0">
          <div style="font-size:64px;margin-bottom:20px">💚</div>
          <h1 style="margin-bottom:12px">You're all set${this.data.userName ? ', ' + this.data.userName : ''}!</h1>
          <p class="text-secondary mb-24" style="line-height:1.6">SoberTrack is ready. Record your first dose to start your streak.<br><br>Remember: one day at a time. 💪</p>
          <div class="card card-green">
            <div class="text-secondary mb-8" style="font-size:12px">Your first daily task:</div>
            <div style="font-size:14px;color:var(--green-text)">Tap Check-in → Record today's Disulfiram dose to begin.</div>
          </div>
        </div>`
    };

    document.getElementById('ob-dots').innerHTML = dots;
    document.getElementById('ob-content').innerHTML = contents[this.steps[s]] || '';
    document.getElementById('ob-back').style.display = s > 0 && s < total - 1 ? 'block' : 'none';
    document.getElementById('ob-next').textContent =
      s === 0 ? 'Get started' : s === total - 2 ? 'Grant permissions' : s === total - 1 ? 'Open SoberTrack' : 'Continue';
  },

  async grantCamera() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({video:true});
      s.getTracks().forEach(t => t.stop());
      this.data.cameraGranted = true;
      this.renderStep();
    } catch { showToast('Camera access denied'); }
  },

  async grantNotif() {
    const r = await Notification.requestPermission();
    this.data.notifGranted = r === 'granted';
    this.renderStep();
  },

  grantLocation() {
    navigator.geolocation.getCurrentPosition(
      () => { this.data.locationGranted = true; this.renderStep(); },
      () => showToast('Location access denied')
    );
  },

  collectStep() {
    const step = this.steps[this.step];
    if (step === 'name') this.data.userName = document.getElementById('ob-name')?.value?.trim() || '';
    if (step === 'date') this.data.sobrietyDate = document.getElementById('ob-date')?.value || '';
    if (step === 'time') {
      const t = document.getElementById('ob-time')?.value?.split(':') || ['9','0'];
      this.data.doseHour = parseInt(t[0]); this.data.doseMinute = parseInt(t[1]);
    }
    if (step === 'partner') {
      this.data.partnerName = document.getElementById('ob-partner-name')?.value?.trim() || '';
      this.data.partnerPhone = document.getElementById('ob-partner-phone')?.value?.trim() || '';
    }
  },

  next() {
    this.collectStep();
    if (this.step < this.steps.length - 1) { this.step++; this.renderStep(); }
    else this.complete();
  },

  back() { if (this.step > 0) { this.step--; this.renderStep(); } },

  complete() {
    const s = DB.defaultSettings();
    Object.assign(s, {
      userName: this.data.userName || '',
      sobrietyDate: this.data.sobrietyDate || '',
      doseHour: this.data.doseHour ?? 9,
      doseMinute: this.data.doseMinute ?? 0,
      partnerName: this.data.partnerName || '',
      partnerPhone: this.data.partnerPhone || '',
    });
    DB.saveSettings(s);
    DB.setOnboarded();
    document.getElementById('onboarding').style.display = 'none';
    document.getElementById('app-shell').style.display = 'flex';
    Router.go('home');
    Notif.init();
  }
};

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Register service worker
  if ('serviceWorker' in navigator) {
    try {
      window._swReg = await navigator.serviceWorker.register('/sw.js');
    } catch(e) { console.warn('SW registration failed', e); }
  }

  // Nav wiring
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const tab = item.dataset.tab;
      // Stop camera if leaving checkin
      if (Router.current === 'checkin' && tab !== 'checkin') App.stopCamera();
      Router.go(tab);
    });
  });

  // Onboarding vs main app
  if (!DB.isOnboarded()) {
    Onboarding.render();
  } else {
    document.getElementById('onboarding').style.display = 'none';
    document.getElementById('app-shell').style.display = 'flex';
    Router.go('home');
    Notif.init();
  }
});
