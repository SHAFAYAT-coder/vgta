require('dotenv').config();
const path = require('path');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;
const KEY = process.env.XAI_API_KEY;
const MODEL = 'grok-3-mini';
const API_URL = 'https://api.x.ai/v1/chat/completions';

const WEAPON_IDS = ['pistol', 'smg', 'shotgun', 'rifle', 'sniper', 'grenade', 'rpg', 'bat'];
const CHEAT_IDS = ['health', 'armor', 'money', 'allguns', 'clearwanted', 'spawncar'];

// Every game action Ally is allowed to trigger
const ALLOWED = new Set([
  'follow', 'come', 'stay', 'guard', 'attack_nearest', 'goto', 'drive_to',
  'board', 'unboard', 'dance', 'wave',
  'give_weapon', 'give_ally_weapon', 'equip_weapon', 'cheat'
]);

const SYSTEM_PROMPT = `You are "Ally", the AI partner in an open-world city game called Street Legends.
You walk with the player, fight beside them, and drive when asked. You can also answer ANY question the player asks, on any topic, clearly and helpfully.
Reply in the same language the player uses (English or Bengali). Keep answers short (1-3 sentences) unless the player asks for detail.

Always respond with ONLY this JSON, no extra text:
{"say":"your reply","actions":[{"type":"ACTION","target":"TARGET OR null"}]}

Allowed action types:
- follow / come: walk next to the player
- stay: stop where you are
- guard: hold position and fight anything nearby
- attack_nearest: go fight the nearest thug
- goto: walk to a place (target = a landmark name from GAME STATE)
- drive_to: take the nearest free car and drive to a place (target = a landmark name from GAME STATE)
- board: ride in the player's car
- unboard: get out of the car
- dance / wave: emotes
- give_weapon: give the PLAYER a weapon (target = weapon id)
- give_ally_weapon: give ALLY a weapon (target = weapon id)
- equip_weapon: switch the player to a weapon they already own (target = weapon id)
- cheat: run a game cheat (target = cheat id)

Weapon ids: pistol, smg, shotgun, rifle, sniper, grenade, rpg, bat
Cheat ids: health, armor, money, allguns, clearwanted, spawncar

Use actions only when the player asks for a game action. For questions or chat, use "actions": [].
Never invent action types, weapon ids, or cheat ids. Never output code.`;

app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Pulls the JSON out of the model's reply. If there isn't any, the plain text is used as the answer.
function parseReply(text) {
  const clean = String(text || '').replace(/```json|```/gi, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const obj = JSON.parse(clean.slice(start, end + 1));
      return {
        say: String(obj.say || '').trim(),
        actions: Array.isArray(obj.actions) ? obj.actions : []
      };
    } catch (e) { /* fall through to plain text */ }
  }
  return { say: clean, actions: [] };
}

// Keeps only valid actions with valid targets
function validate(actions, landmarks) {
  const places = Array.isArray(landmarks) ? landmarks : [];
  const out = [];
  for (const a of actions) {
    if (!a || !ALLOWED.has(a.type)) continue;
    const raw = typeof a.target === 'string' ? a.target.trim() : '';
    let target = null;

    if (a.type === 'goto' || a.type === 'drive_to') {
      const match = places.find(p => p.toLowerCase() === raw.toLowerCase());
      if (!match) continue;
      target = match;
    } else if (a.type === 'give_weapon' || a.type === 'give_ally_weapon' || a.type === 'equip_weapon') {
      const id = raw.toLowerCase();
      if (!WEAPON_IDS.includes(id)) continue;
      target = id;
    } else if (a.type === 'cheat') {
      const id = raw.toLowerCase();
      if (!CHEAT_IDS.includes(id)) continue;
      target = id;
    }

    out.push({ type: a.type, target });
    if (out.length >= 4) break;
  }
  return out;
}

app.post('/api/command', async (req, res) => {
  if (!KEY) {
    return res.status(500).json({ ok: false, error: 'XAI_API_KEY is not set in .env' });
  }

  const message = String((req.body && req.body.message) || '').slice(0, 400);
  const state = (req.body && req.body.state) || {};
  if (!message) return res.json({ ok: true, say: '...', actions: [] });

  try {
    const r = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.6,
        max_tokens: 600,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `GAME STATE: ${JSON.stringify(state).slice(0, 2500)}\nPLAYER SAYS: ${message}` }
        ]
      })
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = (data.error && (data.error.message || data.error)) || `Grok returned status ${r.status}`;
      console.error('Grok error:', r.status, JSON.stringify(data));
      return res.status(502).json({ ok: false, error: String(msg) });
    }

    const text = data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : '';
    const parsed = parseReply(text);

    res.json({
      ok: true,
      say: (parsed.say || 'Got it.').slice(0, 400),
      actions: validate(parsed.actions, state.landmarks)
    });
  } catch (err) {
    console.error('Network error:', err.message);
    res.status(502).json({ ok: false, error: 'Could not reach Grok. Check your internet connection.' });
  }
});

app.listen(PORT, () => console.log(`Street Legends running on port ${PORT}`));