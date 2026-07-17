// api/rsvp.js — stores RSVPs in rsvps.json in the GitHub repo
// Format: { "rsvps": [...], "trash": [...] }

const OWNER      = 'josephsismart';
const REPO       = 'melfred_cherrymay';
const FILE       = 'rsvps.json';
const ADMIN_CODE = 'melchem2026';
const API_URL    = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE}`;

function phTime() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000)
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d+Z$/, ' PHT');
}

async function readFile() {
  const res = await fetch(API_URL, {
    headers: {
      Authorization: `token ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'mc-wedding-rsvp'
    }
  });
  if (!res.ok) throw new Error(`GitHub read error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const raw = JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8'));
  // migrate from old plain-array format
  const parsed = Array.isArray(raw) ? { rsvps: raw, trash: [] } : raw;
  if (!parsed.trash) parsed.trash = [];
  return { rsvps: parsed.rsvps, trash: parsed.trash, sha: data.sha };
}

async function writeFile(rsvps, trash, sha, commitMsg) {
  const content = Buffer.from(JSON.stringify({ rsvps, trash }, null, 2)).toString('base64');
  const res = await fetch(API_URL, {
    method: 'PUT',
    headers: {
      Authorization: `token ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'mc-wedding-rsvp'
    },
    body: JSON.stringify({ message: commitMsg, content, sha })
  });
  if (!res.ok) throw new Error(`GitHub write error ${res.status}: ${await res.text()}`);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!process.env.GITHUB_TOKEN) {
    return res.status(500).json({ error: 'GITHUB_TOKEN not configured.' });
  }

  try {
    // ── POST: submit new RSVP ──
    if (req.method === 'POST') {
      const { name, attending, message } = req.body || {};
      if (!name?.trim()) return res.status(400).json({ error: 'Name is required.' });

      const { rsvps, trash, sha } = await readFile();
      rsvps.unshift({
        name:      name.trim(),
        attending: attending === true || attending === 'true',
        message:   (message || '').trim(),
        submitted: phTime()
      });
      await writeFile(rsvps, trash, sha, `RSVP: ${rsvps[0].name}`);
      return res.status(200).json({ ok: true, total: rsvps.length });
    }

    // ── GET: read all RSVPs (admin only) ──
    if (req.method === 'GET') {
      const { code } = req.query;
      if (code !== ADMIN_CODE) return res.status(401).json({ error: 'Unauthorized' });
      const { rsvps, trash } = await readFile();
      return res.status(200).json({ rsvps, trash });
    }

    // ── DELETE: move an RSVP to trash (admin only) ──
    if (req.method === 'DELETE') {
      const { code, index } = req.query;
      if (code !== ADMIN_CODE) return res.status(401).json({ error: 'Unauthorized' });
      const idx = parseInt(index, 10);
      if (isNaN(idx)) return res.status(400).json({ error: 'Invalid index.' });

      const { rsvps, trash, sha } = await readFile();
      if (idx < 0 || idx >= rsvps.length) return res.status(404).json({ error: 'Entry not found.' });

      const [removed] = rsvps.splice(idx, 1);
      removed.deletedAt = phTime();
      trash.unshift(removed);

      await writeFile(rsvps, trash, sha, `Delete RSVP: ${removed.name}`);
      return res.status(200).json({ ok: true, deleted: removed });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
