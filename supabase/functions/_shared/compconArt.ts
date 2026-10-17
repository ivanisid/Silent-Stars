// Арти з хмари COMP/CON → арти апки (рішення користувача 17.10.2026: лише заповнювати порожні).
//
// У файлі COMP/CON пілот і мехи можуть мати посилання на арт у хмарі COMP/CON (пілот —
// cloud_portrait, мех — cloud_portrait / portrait); імпортер системи Lancer бере саме їх. Тут
// такий арт завантажується в сховище апки (pilot-art) і стає звичайним артом апки — далі він
// іде у Foundry тим самим шляхом, що й завантажений вручну (foundry-art-sync, модуль). Арт,
// який в апці вже є, не замінюється.

import { SupabaseClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'pilot-art';
const MAX_BYTES = 10 * 1024 * 1024; // як ліміт бакета
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

const httpsUrl = (v: unknown) => (typeof v === 'string' && /^https:\/\//i.test(v.trim()) ? v.trim() : '');
const pilotUrl = (d: any) => httpsUrl(d?.cloud_portrait) || httpsUrl(d?.img?.cloud_portrait);
const mechUrl = (m: any) => httpsUrl(m?.cloud_portrait) || httpsUrl(m?.img?.cloud_portrait) || httpsUrl(m?.portrait);

async function download(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`арт COMP/CON: HTTP ${res.status}`);
  const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!EXT[type]) throw new Error(`арт COMP/CON: не зображення (${type || 'невідомий тип'})`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error('арт COMP/CON більший за 10 МБ');
  return { buf, type };
}

// profiles — файли COMP/CON по одному на меха апки ({ mechId, data: { data: пілот з одним мехом } },
// як рядки pilot_compcon). → { added, errors }
export async function importCloudArt(db: SupabaseClient, pilotId: string, profiles: { mechId: string; data: any }[]) {
  const { data: pilot, error } = await db.from('pilots').select('user_id').eq('id', pilotId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!pilot) return { added: 0, errors: ['пілота не знайдено'] };
  const { data: arts, error: e1 } = await db.from('art_uploads').select('kind, mech_id')
    .eq('pilot_id', pilotId).is('deleted_at', null);
  if (e1) throw new Error(e1.message);
  const has = new Set((arts || []).map((a: any) => (a.kind === 'portrait' ? 'portrait' : `mech:${a.mech_id}`)));

  const wanted: { kind: 'portrait' | 'mech'; mechId: string | null; url: string }[] = [];
  const first = profiles[0]?.data?.data ?? profiles[0]?.data;
  if (!has.has('portrait') && pilotUrl(first)) wanted.push({ kind: 'portrait', mechId: null, url: pilotUrl(first) });
  for (const p of profiles) {
    const url = mechUrl((p.data?.data ?? p.data)?.mechs?.[0]);
    if (url && !has.has(`mech:${p.mechId}`)) wanted.push({ kind: 'mech', mechId: String(p.mechId), url });
  }

  let added = 0;
  const errors: string[] = [];
  for (const w of wanted) {
    try {
      const { buf, type } = await download(w.url);
      const path = `${pilot.user_id}/${pilotId}/${w.kind}-${crypto.randomUUID()}.${EXT[type]}`;
      const { error: upErr } = await db.storage.from(BUCKET).upload(path, buf, { contentType: type });
      if (upErr) throw new Error(upErr.message);
      const { error: insErr } = await db.from('art_uploads').insert({
        user_id: pilot.user_id, storage_path: path, file_name: `compcon-${w.kind}.${EXT[type]}`, size_bytes: buf.length,
        pilot_id: pilotId, kind: w.kind, mech_id: w.mechId,
      });
      if (insErr) {
        await db.storage.from(BUCKET).remove([path]);
        throw new Error(insErr.message);
      }
      added++;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return { added, errors };
}
