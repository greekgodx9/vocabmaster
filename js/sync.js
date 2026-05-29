// Sync module — cross-device cloud sync via Netlify Function + GitHub Gist
// Client → Netlify Function (same domain, works in China) → GitHub API (server-side)
const Sync = {

  // ── Configuration ──────────────────────────────────────────────────────
  _getConfig() {
    const s = Storage.getSettings();
    const syncId = s.syncId || '';
    const passphrase = s.syncPassphrase || '';
    return {
      syncId, passphrase,
      apiUrl: '/.netlify/functions/sync',   // same domain, always accessible
      get enabled() { return !!(this.syncId && this.passphrase); },
    };
  },

  // ── API call ───────────────────────────────────────────────────────────
  async _api(action, data) {
    const cfg = this._getConfig();
    if (!cfg.enabled) throw new Error('Sync passphrase not set');

    const res = await fetch(cfg.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, syncId: cfg.syncId, passphrase: cfg.passphrase, data }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Sync server error ${res.status}: ${text.slice(0, 200)}`);
    }

    return res.json();
  },

  // ── Push local data to cloud ───────────────────────────────────────────
  async push() {
    const payload = Storage.exportAll();
    payload._deviceId = this._deviceId();
    payload._pushedAt = new Date().toISOString();

    const result = await this._api('push', payload);
    Storage.saveSettings({ _lastSyncPushedAt: new Date().toISOString() });
    return result;
  },

  // ── Pull remote data from cloud ────────────────────────────────────────
  async pull() {
    const result = await this._api('pull');
    if (!result.exists || !result.data) return null;
    return result.data;
  },

  // ── Smart merge: combine local + remote, keep best version ────────────
  _mergeInto(remote) {
    if (!remote || !remote.words) return;

    const local = Storage.exportAll();

    // Words: merge by ID, keep the one with more review progress
    const wordMap = new Map();
    for (const w of local.words || []) wordMap.set(w.id, w);
    for (const w of remote.words || []) {
      const existing = wordMap.get(w.id);
      if (!existing) {
        wordMap.set(w.id, w);
      } else {
        const existProg = (existing.sm2?.repetitions || 0) + (existing.sm2?.interval || 0);
        const remoteProg = (w.sm2?.repetitions || 0) + (w.sm2?.interval || 0);
        if (remoteProg > existProg) wordMap.set(w.id, w);
        if (w.richMeanings && (!existing.richMeanings || existing.richMeanings.length === 0)) {
          existing.richMeanings = w.richMeanings;
          existing.phonetic = existing.phonetic || w.phonetic;
          existing.examples = existing.examples || w.examples;
          wordMap.set(w.id, existing);
        }
      }
    }
    Storage.saveWords([...wordMap.values()]);

    // Check-ins: union
    const checkInSet = new Set([...(local.checkIns || []), ...(remote.checkIns || [])]);
    localStorage.setItem('vm_checkins', JSON.stringify([...checkInSet].sort()));

    // Word books: merge by ID, keep most progressed
    const bookMap = new Map();
    for (const b of local.wordBooks || []) bookMap.set(b.id, b);
    for (const b of remote.wordBooks || []) {
      const existing = bookMap.get(b.id);
      if (!existing) { bookMap.set(b.id, b); }
      else if ((b.releasedCount || 0) > (existing.releasedCount || 0)) { bookMap.set(b.id, b); }
    }
    Storage.saveWordBooks([...bookMap.values()]);

    // Settings: merge preferences; keep local credentials
    const remoteSettings = remote.settings || {};
    const protectedKeys = ['apiKey', 'apiProvider', 'apiModel', 'customUrl',
      'syncId', 'syncPassphrase'];
    for (const k of protectedKeys) delete remoteSettings[k];
    Storage.saveSettings({ ...remoteSettings, ...Storage.getSettings() });

    Storage.saveSettings({ _lastSyncPulledAt: new Date().toISOString() });
  },

  // ── Full sync cycle: pull → merge → push ──────────────────────────────
  async sync() {
    const cfg = this._getConfig();
    if (!cfg.enabled) {
      console.log('[Sync] No passphrase, skipping');
      return { pulled: false, pushed: false };
    }

    let pulled = false, pushed = false;

    try {
      const remote = await this.pull();
      if (remote) { this._mergeInto(remote); pulled = true; }
    } catch (err) {
      console.warn('[Sync] Pull failed:', err.message);
    }

    try {
      await this.push();
      pushed = true;
    } catch (err) {
      console.warn('[Sync] Push failed:', err.message);
    }

    return { pulled, pushed };
  },

  // ── Device ID ──────────────────────────────────────────────────────────
  _deviceId() {
    let id = localStorage.getItem('vm_device_id');
    if (!id) {
      id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
      localStorage.setItem('vm_device_id', id);
    }
    return id;
  },

  // ── Quick status ───────────────────────────────────────────────────────
  async status() {
    const cfg = this._getConfig();
    if (!cfg.enabled) return { configured: false };
    try {
      const result = await this._api('pull');
      return {
        configured: true,
        remoteExists: result.exists,
        updatedAt: result.updatedAt || null,
      };
    } catch {
      return { configured: true, remoteExists: false, error: true };
    }
  },
};
