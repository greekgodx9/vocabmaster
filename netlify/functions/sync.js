// Netlify Function — Cloud Sync via GitHub Gist
// Client calls this from China → Netlify proxies to GitHub API (server-side)
const crypto = require('crypto');

function hashSyncKey(syncId, passphrase) {
  return crypto.createHash('sha256').update('vocabmaster:' + (syncId || '') + ':' + passphrase).digest('hex').slice(0, 32);
}

async function findGist(description, token) {
  const res = await fetch('https://api.github.com/gists?per_page=100', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'VocabMaster-Sync/1.0',
    },
  });
  if (!res.ok) {
    console.error('GitHub list error:', res.status);
    return null;
  }
  const gists = await res.json();
  return gists.find(g => g.description === description) || null;
}

// Fetch a single gist by ID — the list API doesn't return file CONTENT,
// so we must call this to get the actual data.
async function getGist(gistId, token) {
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'VocabMaster-Sync/1.0',
    },
  });
  if (!res.ok) {
    console.error('GitHub get error:', res.status);
    return null;
  }
  return res.json();
}

async function createGist(description, data, token) {
  const res = await fetch('https://api.github.com/gists', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github+json',
      'User-Agent': 'VocabMaster-Sync/1.0',
    },
    body: JSON.stringify({
      description,
      public: false,
      files: { 'vocabmaster-data.json': { content: JSON.stringify(data) } },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub create error ${res.status}: ${err}`);
  }
  return res.json();
}

async function updateGist(gistId, data, token) {
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github+json',
      'User-Agent': 'VocabMaster-Sync/1.0',
    },
    body: JSON.stringify({
      files: { 'vocabmaster-data.json': { content: JSON.stringify(data) } },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub update error ${res.status}: ${err}`);
  }
  return res.json();
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  const GITHUB_TOKEN = process.env.SYNC_GITHUB_TOKEN;
  if (!GITHUB_TOKEN) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server not configured: missing GitHub token' }) };
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { syncId, passphrase, action, data } = body;

    if (!syncId || syncId.length < 2) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Sync ID required (min 2 chars) — like a username' }) };
    }
    if (!passphrase || passphrase.length < 3) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Passphrase required (min 3 chars)' }) };
    }

    const hash = hashSyncKey(syncId, passphrase);
    const description = `vocabmaster-sync:${hash}`;

    if (action === 'pull') {
      const gistMeta = await findGist(description, GITHUB_TOKEN);
      if (!gistMeta) {
        return { statusCode: 200, headers, body: JSON.stringify({ data: null, exists: false }) };
      }
      // MUST fetch full gist by ID — list API doesn't include file content
      const gist = await getGist(gistMeta.id, GITHUB_TOKEN);
      if (!gist) {
        return { statusCode: 200, headers, body: JSON.stringify({ data: null, exists: false }) };
      }
      const content = gist.files['vocabmaster-data.json']?.content;
      return {
        statusCode: 200, headers,
        body: JSON.stringify({
          exists: true,
          data: content ? JSON.parse(content) : null,
          updatedAt: gist.updated_at,
        }),
      };
    }

    if (action === 'push' && data) {
      let gist = await findGist(description, GITHUB_TOKEN);
      let result;
      if (gist) {
        result = await updateGist(gist.id, data, GITHUB_TOKEN);
      } else {
        result = await createGist(description, data, GITHUB_TOKEN);
      }
      return {
        statusCode: 200, headers,
        body: JSON.stringify({ ok: true, updatedAt: result.updated_at }),
      };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Specify action=pull or action=push with data' }) };
  } catch (err) {
    console.error('Sync error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
