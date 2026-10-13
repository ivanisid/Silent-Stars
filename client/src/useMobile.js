import { useSyncExternalStore } from 'react';

// Мобільна версія інтерфейсу (≤640px): нижній таб-бар замість рейки, стрічка магазину,
// вкладки профілю. Брейкпоінт той самий, що в CSS (@media (max-width: 640px)).
export const MOBILE_QUERY = '(max-width: 640px)';

const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(MOBILE_QUERY) : null;

function subscribe(fn) {
  if (!mq) return () => {};
  mq.addEventListener('change', fn);
  return () => mq.removeEventListener('change', fn);
}

export function useIsMobile() {
  return useSyncExternalStore(subscribe, () => !!mq?.matches, () => false);
}
