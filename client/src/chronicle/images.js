import { useEffect, useState } from 'react';
import { api } from '../api';

// Тимчасові адреси картинок хроніки: спільний кеш на сторінку, адреса живе годину —
// беремо нову, коли до кінця лишилось менше 10 хвилин.
const cache = new Map(); // path -> { url, until }
const TTL = 50 * 60 * 1000;

export async function imageUrls(paths) {
  const now = Date.now();
  const need = paths.filter((p) => p && !(cache.get(p)?.until > now));
  if (need.length) {
    const got = await api.chronicleImageUrls([...new Set(need)]);
    Object.entries(got).forEach(([p, url]) => cache.set(p, { url, until: now + TTL }));
  }
  return Object.fromEntries(paths.filter((p) => cache.has(p)).map((p) => [p, cache.get(p).url]));
}

export function useImageUrls(paths) {
  const key = [...new Set(paths.filter(Boolean))].sort().join('|');
  const [urls, setUrls] = useState({});
  useEffect(() => {
    if (!key) return undefined;
    let off = false;
    imageUrls(key.split('|'))
      .then((u) => !off && setUrls(u))
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [key]);
  return urls;
}
