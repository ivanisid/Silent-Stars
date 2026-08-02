import { GAMES_TABLE, HANGAR_DATA } from './constants';
import { computeLL, llTier, skillCapMax, skillCapUsed } from './logic';

// Cross-cutting computed values used by multiple panels — the parts of the original
// renderVals() that aren't purely local to one component.
export function derivePilotView(state) {
  const ll = computeLL(state.games);
  const tier = llTier(ll);
  const prevGames = GAMES_TABLE[ll - 2] || 0;
  const nextGames = ll < 12 ? GAMES_TABLE[ll - 1] : null;
  const pct = nextGames ? Math.min(100, Math.round(((state.games - prevGames) / (nextGames - prevGames)) * 100)) : 100;
  const llNextLabel = nextGames ? `${nextGames - state.games} ігор до ЛЛ ${ll + 1}` : 'МАКСИМАЛЬНИЙ ЛЛ';

  const dcStoreVisible = (state.hangar.owned.buffer || 0) >= 1;
  const dcStoreCap = (state.hangar.owned.buffer || 0) >= 2 ? 10 : 5;

  const capMax = skillCapMax(ll, state.skillCapBonus);
  const capUsed = skillCapUsed(state.skillTriggers);

  return {
    ll,
    tier,
    pct,
    llNextLabel,
    dcStoreVisible,
    dcStoreCap,
    skillCapMax: capMax,
    skillCapUsed: capUsed,
  };
}

export function hangarBuyLabel(item, owned) {
  const max = item.prices.length;
  const price = item.prices[Math.min(owned, max - 1)];
  return `ПРИДБАТИ${max > 1 ? ' РІВ. ' + (owned + 1) : ''} — ${price} М`;
}

export function hangarPrice(item, owned) {
  return item.prices[Math.min(owned, item.prices.length - 1)];
}

export { HANGAR_DATA };
