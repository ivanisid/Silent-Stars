// Пілот COMP/CON за share code — спільне для compcon-code (апка) і foundry-sync / foundry-hub
// (модуль Foundry). API COMP/CON приймає запити з браузера лише з compcon.app, тож і апка, і
// модуль ходять через функції.
//
// Адреси й ключ — як у системі Lancer (src/module/util/compcon.ts); їх можна змінити
// секретами CC_API_BASE, CC_API_KEY, CC_CDN без нового коду.

const API_BASE = (Deno.env.get('CC_API_BASE') || 'https://api.compcon.app').replace(/\/+$/, '');
const API_KEY = Deno.env.get('CC_API_KEY') || 'fcFvjjrnQy2hypelJQi4X9dRI55r5KuI4bC07Maf';
const CDN = (Deno.env.get('CC_CDN') || 'https://ds69h3g1zxwgy.cloudfront.net').replace(/\/+$/, '');

export const SHARE_CODE = /^[A-Z0-9]{12}$/;

// { updated, name, data } — `updated` (мс) — версія для порівняння з прийнятою в апці; data —
// файл пілота з хмари (v3, без обгортки експорту). Коду немає в COMP/CON — null.
export async function byCode(code: string) {
  const url = `${API_BASE}/v3/code?codes=${encodeURIComponent(JSON.stringify([code]))}&scope=items`;
  const res = await fetch(url, { headers: { 'x-api-key': API_KEY } });
  if (!res.ok) throw new Error(`COMP/CON відповів ${res.status}`);
  const list = await res.json();
  const entry = Array.isArray(list) ? list.find((e) => e?.code === code) ?? list[0] : null;
  if (!entry?.uri) return null;
  const file = await fetch(`${CDN}/${entry.uri}?cb=${Date.now()}`, { cache: 'no-store' });
  if (!file.ok) throw new Error(`Файл пілота в COMP/CON недоступний (${file.status})`);
  const data = await file.json();
  if (data?.itemType !== 'pilot' || !Array.isArray(data?.mechs)) throw new Error('За цим кодом у COMP/CON не пілот.');
  return { updated: Number(entry.updated) || Number(data?.save?.lastModified) || 0, name: String(entry.name || data.name || ''), data };
}
