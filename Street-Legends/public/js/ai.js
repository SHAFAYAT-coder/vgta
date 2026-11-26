// Sends your words to the server (Grok). If the server is unreachable, a simple offline parser handles basic commands.
export async function askCompanion(message, state) {
  try {
    const res = await fetch('/api/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, state })
    });
    const data = await res.json();
    if (data.ok) return data;
    return { ok: true, say: `Ally error: ${data.error || 'unknown error'}`, actions: [] };
  } catch (err) {
    // Server not reachable: fall back to the offline parser
  }
  return localParse(message, state);
}

export function localParse(message, state) {
  const m = message.toLowerCase();
  const places = state.landmarks || [];
  const place = places.find(p => m.includes(p.toLowerCase())) || null;
  const actions = [];
  let say = 'Offline mode: I can follow, guard, attack, dance, wave, get in a car or drive you places.';

  if (/\b(get in|hop in|jump in|ride with|board)\b/.test(m)) {
    actions.push({ type: 'board' }); say = 'Hopping in!';
  } else if (/\b(get out|hop out|jump out|leave the car|unboard)\b/.test(m)) {
    actions.push({ type: 'unboard' }); say = 'Out we go.';
  } else if (/\bdrive\b/.test(m) && place) {
    actions.push({ type: 'drive_to', target: place }); say = `Taking the wheel to the ${place}.`;
  } else if (/\b(go to|head to|walk to|take me to|meet at)\b/.test(m) && place) {
    actions.push({ type: 'goto', target: place }); say = `Heading to the ${place}.`;
  } else if (/\b(attack|fight|kill|get them|hit them)\b/.test(m)) {
    actions.push({ type: 'attack_nearest' }); say = 'Going in!';
  } else if (/\b(guard|protect|watch my back|cover me)\b/.test(m)) {
    actions.push({ type: 'guard' }); say = "I've got your back.";
  } else if (/\b(stay|wait|stop|hold on|don't move)\b/.test(m)) {
    actions.push({ type: 'stay' }); say = 'Staying put.';
  } else if (/\b(follow|come|with me|let's go|lets go|move)\b/.test(m)) {
    actions.push({ type: 'follow' }); say = 'Right behind you.';
  } else if (/\bdance\b/.test(m)) {
    actions.push({ type: 'dance' }); say = 'Watch this!';
  } else if (/\b(wave|hi|hello|hey)\b/.test(m)) {
    actions.push({ type: 'wave' }); say = 'Hey!';
  }

  return { ok: true, say, actions };
}