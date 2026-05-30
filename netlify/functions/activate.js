// Netlify Function — VIP Activation Code Validation
// Reads/writes codes from a private GitHub Gist (server-side)
const VIP_GIST_ID = 'ce7b8b7da4278f705c613b692420d1a1';

async function getCodes(token) {
  const res = await fetch(`https://api.github.com/gists/${VIP_GIST_ID}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'VocabMaster/1.0' },
  });
  if (!res.ok) throw new Error(`GitHub error ${res.status}`);
  const gist = await res.json();
  return JSON.parse(gist.files['codes.json'].content);
}

async function saveCodes(codes, token) {
  const res = await fetch(`https://api.github.com/gists/${VIP_GIST_ID}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/vnd.github+json', 'User-Agent': 'VocabMaster/1.0' },
    body: JSON.stringify({ files: { 'codes.json': { content: JSON.stringify(codes, null, 2) } } }),
  });
  if (!res.ok) throw new Error(`GitHub update error ${res.status}`);
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };

  const GITHUB_TOKEN = process.env.SYNC_GITHUB_TOKEN;
  if (!GITHUB_TOKEN) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server not configured' }) };
  }

  try {
    const { action, code, username } = JSON.parse(event.body || '{}');

    if (action === 'verify') {
      // Check if a username has an active VIP subscription
      const codes = await getCodes(GITHUB_TOKEN);
      for (const [c, info] of Object.entries(codes)) {
        if (info && info.startsWith(username + '|')) {
          const parts = info.split('|');
          const expiresAt = parts[2];
          if (new Date(expiresAt) > new Date()) {
            return { statusCode: 200, headers, body: JSON.stringify({ active: true, code: c, expiresAt }) };
          }
        }
      }
      return { statusCode: 200, headers, body: JSON.stringify({ active: false }) };
    }

    if (action === 'activate') {
      if (!code || !username) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Code and username required' }) };
      }

      const codes = await getCodes(GITHUB_TOKEN);

      // Check if code exists
      if (!(code in codes)) {
        return { statusCode: 200, headers, body: JSON.stringify({ error: 'Invalid activation code' }) };
      }

      // Check if code is already used
      if (codes[code] !== null) {
        const existingUser = codes[code].split('|')[0];
        if (existingUser === username) {
          // Same user re-activating — allow it
        } else {
          return { statusCode: 200, headers, body: JSON.stringify({ error: 'This code has already been used' }) };
        }
      }

      // Check if this username already has an active subscription from another code
      for (const [c, info] of Object.entries(codes)) {
        if (info && info.startsWith(username + '|') && c !== code) {
          const parts = info.split('|');
          if (new Date(parts[2]) > new Date()) {
            return { statusCode: 200, headers, body: JSON.stringify({ error: 'This username already has an active subscription', active: true, expiresAt: parts[2] }) };
          }
        }
      }

      // Activate: bind code to username with 1-year expiry
      const now = new Date();
      const expiresAt = new Date(now);
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      codes[code] = `${username}|${now.toISOString().slice(0, 10)}|${expiresAt.toISOString().slice(0, 10)}`;

      await saveCodes(codes, GITHUB_TOKEN);

      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, username, expiresAt: expiresAt.toISOString().slice(0, 10) }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action' }) };
  } catch (err) {
    console.error('Activate error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
