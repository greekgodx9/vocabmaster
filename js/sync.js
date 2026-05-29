// Sync module — cross-device sync via Supabase
// Uses Supabase REST API directly (no SDK), lightweight fetch-based client.
const Sync = {

  // ── Configuration ──────────────────────────────────────────────────────
  _getConfig() {
    const s = Storage.getSettings();
    return {
      url: (s.supabaseUrl || '').replace(/\/+$/, ''),
      key: s.supabaseKey || '',
      passphrase: s.syncPassphrase || '',
      get enabled() {
        return !!(this.url && this.key && this.passphrase);
      },
    };
  },

  // ── Crypto: hash passphrase → deterministic 32-char hex row ID ────────
  async _rowId(passphrase) {
    const encoder = new TextEncoder();
    const data = encoder.encode('vocabmaster:' + (passphrase || ''));
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 32);
  },

  // ── Device ID (persistent per device) ──────────────────────────────────
  _deviceId() {
    let id = localStorage.getItem('vm_device_id');
    if (!id) {
      id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
      localStorage.setItem('vm_device_id', id);
    }
    return id;
  },

  // ── Low-level API call ─────────────────────────────────────────────────
  async _api(method, path, body) {
    const cfg = this._getConfig();
    if (!cfg.enabled) throw new Error('Sync not configured — set URL, Key, and Passphrase in Settings');

    const headers = {
      'apikey': cfg.key,
      'Authorization': `Bearer ${cfg.key}`,
      'Content-Type': 'application/json',
    };

    if (method === 'POST' || method === 'PATCH') {
      headers['Prefer'] = 'return=representation';
    }

    const res = await fetch(`${cfg.url}/rest/v1${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (res.status === 404) return []; // table doesn't exist yet
      throw new Error(`Sync ${res.status}: ${text.slice(0, 200)}`);
    }

    const json = await res.json();
    return json || [];
  },

  // ── Push: upload local data to server ──────────────────────────────────
  async push() {
    const cfg = this._getConfig();
    if (!cfg.enabled) throw new Error('Sync not configured');

    const rowId = await this._rowId(cfg.passphrase);
    const payload = Storage.exportAll();
    payload._deviceId = this._deviceId();
    payload._pushedAt = new Date().toISOString();

    // Try PATCH first (update existing row), then POST (insert new)
    const res = await this._api('PATCH', `/vocabmaster_sync?id=eq.${rowId}`, {
      id: rowId,
      sync_code_hash: rowId,
      payload: payload,
      updated_at: new Date().toISOString(),
    });

    if (Array.isArray(res) && res.length === 0) {
      // Row doesn't exist yet — create it
      await this._api('POST', '/vocabmaster_sync', {
        id: rowId,
        sync_code_hash: rowId,
        payload: payload,
        updated_at: new Date().toISOString(),
      });
    }

    Storage.saveSettings({ _lastSyncPushedAt: new Date().toISOString() });
    return true;
  },

  // ── Pull: download remote data ─────────────────────────────────────────
  async pull() {
    const cfg = this._getConfig();
    if (!cfg.enabled) throw new Error('Sync not configured');

    const rowId = await this._rowId(cfg.passphrase);
    const rows = await this._api('GET', `/vocabmaster_sync?id=eq.${rowId}&select=payload`);

    if (!rows || !rows.length) return null;
    return rows[0].payload;
  },

  // ── Smart merge: combine local + remote without losing data ────────────
  _mergeInto(remote) {
    if (!remote || !remote.words) return;

    const local = Storage.exportAll();

    // ── Words: merge by ID, keep the one with later dateAdded ──
    const wordMap = new Map();
    for (const w of local.words || []) wordMap.set(w.id, w);
    for (const w of remote.words || []) {
      const existing = wordMap.get(w.id);
      if (!existing) {
        wordMap.set(w.id, w);
      } else {
        // Keep the version with the most review progress
        const existProg = (existing.sm2?.repetitions || 0) + (existing.sm2?.interval || 0);
        const remoteProg = (w.sm2?.repetitions || 0) + (w.sm2?.interval || 0);
        if (remoteProg > existProg) wordMap.set(w.id, w);
        // Also merge richMeanings if local was missing them
        if (w.richMeanings && (!existing.richMeanings || existing.richMeanings.length === 0)) {
          existing.richMeanings = w.richMeanings;
          existing.phonetic = existing.phonetic || w.phonetic;
          existing.examples = existing.examples || w.examples;
          wordMap.set(w.id, existing);
        }
      }
    }
    Storage.saveWords([...wordMap.values()]);

    // ── Check-ins: union ──
    const checkInSet = new Set([...(local.checkIns || []), ...(remote.checkIns || [])]);
    localStorage.setItem('vm_checkins', JSON.stringify([...checkInSet].sort()));

    // ── Word books: merge by ID, keep most updated ──
    const bookMap = new Map();
    for (const b of local.wordBooks || []) bookMap.set(b.id, b);
    for (const b of remote.wordBooks || []) {
      const existing = bookMap.get(b.id);
      if (!existing) {
        bookMap.set(b.id, b);
      } else {
        const existVer = (existing.releasedCount || 0) + (existing.active ? 1 : 0);
        const remoteVer = (b.releasedCount || 0) + (b.active ? 1 : 0);
        if (remoteVer > existVer) bookMap.set(b.id, b);
      }
    }
    Storage.saveWordBooks([...bookMap.values()]);

    // ── Settings: local credentials win, remote preferences merge ──
    const remoteSettings = remote.settings || {};
    const localSettings = local.settings || {};
    // Never overwrite these from remote
    const protectedKeys = ['apiKey', 'apiProvider', 'apiModel', 'customUrl',
      'supabaseUrl', 'supabaseKey', 'syncPassphrase'];
    for (const k of protectedKeys) {
      delete remoteSettings[k];
    }
    // Merge: remote provides defaults, local overrides
    const merged = { ...remoteSettings, ...localSettings };
    Storage.saveSettings(merged);

    Storage.saveSettings({ _lastSyncPulledAt: new Date().toISOString() });
  },

  // ── Full sync cycle ────────────────────────────────────────────────────
  async sync() {
    const cfg = this._getConfig();
    if (!cfg.enabled) {
      console.log('[Sync] Not configured, skipping');
      return { pulled: false, pushed: false };
    }

    let pulled = false, pushed = false;

    try {
      // 1. Pull remote and merge
      const remote = await this.pull();
      if (remote) {
        this._mergeInto(remote);
        pulled = true;
      }
    } catch (err) {
      console.warn('[Sync] Pull failed:', err.message);
    }

    try {
      // 2. Push local to remote
      await this.push();
      pushed = true;
    } catch (err) {
      console.warn('[Sync] Push failed:', err.message);
    }

    return { pulled, pushed };
  },

  // ── Quick status check ─────────────────────────────────────────────────
  async status() {
    const cfg = this._getConfig();
    if (!cfg.enabled) return { configured: false };

    try {
      const rowId = await this._rowId(cfg.passphrase);
      const rows = await this._api('GET', `/vocabmaster_sync?id=eq.${rowId}&select=updated_at,payload`);
      if (!rows || !rows.length) {
        return { configured: true, remoteExists: false };
      }
      const r = rows[0];
      const remoteDevice = r.payload?._deviceId || 'unknown';
      const remotePushedAt = r.payload?._pushedAt || null;
      return {
        configured: true,
        remoteExists: true,
        updatedAt: r.updated_at,
        remoteDeviceId: remoteDevice,
        isOwnPush: remoteDevice === this._deviceId(),
        remotePushedAt: remotePushedAt,
      };
    } catch {
      return { configured: true, remoteExists: false, error: true };
    }
  },
};
