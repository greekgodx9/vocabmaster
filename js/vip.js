// VIP module — 7-day free trial + activation code system
const VIP = {
  TRIAL_DAYS: 7,
  API_URL: '/.netlify/functions/activate',

  // ── Trial ──────────────────────────────────────────────────────────────
  _trialKey: 'vm_trial_start',

  getTrialStart() {
    const v = localStorage.getItem(this._trialKey);
    return v ? new Date(v) : null;
  },

  startTrial() {
    if (!this.getTrialStart()) {
      localStorage.setItem(this._trialKey, new Date().toISOString());
    }
  },

  trialDaysLeft() {
    const start = this.getTrialStart();
    if (!start) return this.TRIAL_DAYS;
    const elapsed = (Date.now() - start.getTime()) / 86400000;
    return Math.max(0, Math.ceil(this.TRIAL_DAYS - elapsed));
  },

  isTrialActive() {
    return this.trialDaysLeft() > 0;
  },

  // ── VIP Status (stored locally after verification) ─────────────────────
  _vipKey: 'vm_vip_status',

  getStatus() {
    try {
      return JSON.parse(localStorage.getItem(this._vipKey)) || { active: false };
    } catch { return { active: false }; }
  },

  _setStatus(s) {
    localStorage.setItem(this._vipKey, JSON.stringify(s));
  },

  // Check if VIP features are currently accessible
  isActive() {
    const s = this.getStatus();
    if (s.active && s.expiresAt && new Date(s.expiresAt) > new Date()) return true;
    // Fall back to trial
    return this.isTrialActive();
  },

  // Days remaining (VIP or trial)
  daysLeft() {
    const s = this.getStatus();
    if (s.active && s.expiresAt) {
      const d = Math.ceil((new Date(s.expiresAt) - Date.now()) / 86400000);
      if (d > 0) return d;
    }
    return this.trialDaysLeft();
  },

  // Human-readable status for UI
  statusText() {
    const s = this.getStatus();
    if (s.active && s.expiresAt && new Date(s.expiresAt) > new Date()) {
      return `&#11088; VIP until ${s.expiresAt}`;
    }
    const trial = this.trialDaysLeft();
    if (trial > 0) {
      return `&#9200; Free trial: ${trial} day${trial > 1 ? 's' : ''} left`;
    }
    return '&#128308; Trial expired — activate VIP';
  },

  // ── Activation ─────────────────────────────────────────────────────────
  async activate(code, username) {
    if (!code || !username) throw new Error('Code and username required');

    const res = await fetch(this.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'activate', code: code.trim().toUpperCase(), username: username.trim() }),
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Server error');
    if (result.error) throw new Error(result.error);

    // Store VIP status locally
    this._setStatus({ active: true, expiresAt: result.expiresAt, code, username });
    return result;
  },

  // ── Remote verify (check if username has active sub on server) ────────
  async verifyFromServer(username) {
    if (!username) return null;
    try {
      const res = await fetch(this.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', username: username.trim() }),
      });
      const result = await res.json();
      if (result.active) {
        this._setStatus({ active: true, expiresAt: result.expiresAt, code: result.code, username });
        return result;
      }
    } catch { /* offline — use local status */ }
    return null;
  },
};
