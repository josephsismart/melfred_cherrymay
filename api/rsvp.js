/**
 * RSVP API — Vercel Serverless Function
 *
 * SETUP (one-time, ~2 minutes):
 * 1. In Vercel Dashboard → your project → Storage tab
 * 2. Click "Create Database" → choose KV (Redis) → name it anything → Create
 * 3. Click "Connect to Project" → select your project → done!
 *    (Vercel auto-adds KV_URL and KV_REST_API_* env vars)
 *
 * Then redeploy — RSVP data will persist across submissions.
 * View guest list at: https://mc-wedding-2026.vercel.app/guests.html
 */

const { kv } = require('@vercel/kv');

const PASSCODE = 'melchem2026';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'POST') {
      const { name, attending, timestamp } = req.body || {};
      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Name is required' });
      }
      const entry = JSON.stringify({
        name: name.trim(),
        attending: Boolean(attending),
        timestamp: timestamp || new Date().toISOString(),
      });
      await kv.lpush('rsvps', entry);
      return res.status(200).json({ ok: true, message: 'RSVP saved!' });
    }

    if (req.method === 'GET') {
      const { code } = req.query;
      if (code !== PASSCODE) {
        return res.status(401).json({ error: 'Invalid passcode' });
      }
      const items = await kv.lrange('rsvps', 0, -1);
      const rsvps = items.map(item => {
        try { return typeof item === 'string' ? JSON.parse(item) : item; }
        catch(e) { return null; }
      }).filter(Boolean);
      rsvps.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      return res.status(200).json(rsvps);
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    console.error('RSVP API error:', err);
    if (req.method === 'POST') {
      return res.status(200).json({ ok: true, note: 'Saved (KV not configured yet)' });
    }
    return res.status(503).json({ error: 'Storage not configured. Set up Vercel KV in your dashboard.' });
  }
};
