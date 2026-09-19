import { HANGAR_DATA, PR_CAP_BASE, PR_CAP_BUFFER } from './constants';
import { llTier, manaLevelCost, skillCapMax, skillCapUsed } from './logic';

// Cross-cutting computed values used by multiple panels — the parts of the original
// renderVals() that aren't purely local to one component.
export function derivePilotView(state) {
  // Рівень зберігається, а не рахується з ігор: його купують за ману. Смуга прогресу
  // тепер показує накопичену ману відносно ціни наступного рівня.
  const ll = state.ll;
  const tier = llTier(ll);
  const levelCost = manaLevelCost(ll);
  const balance = state.mana.balance;
  const pct = levelCost == null ? 100 : Math.min(100, Math.round((balance / levelCost) * 100));
  const canLevelUp = levelCost != null && balance >= levelCost;
  const llNextLabel =
    levelCost == null
      ? 'МАКСИМАЛЬНИЙ ЛЛ'
      : canLevelUp
        ? `ВИСТАЧАЄ НА ЛЛ ${ll + 1}`
        : `${levelCost - balance} мани до ЛЛ ${ll + 1}`;

  // PR — єдиний пул пілота, видимий завжди: 30 PR є вже на старті, до покупки чого-небудь.
  // «Ресурсний буфер» більше не відкриває склад, а лише піднімає кап.
  const prCap = (state.hangar.owned.buffer || 0) >= 1 ? PR_CAP_BUFFER : PR_CAP_BASE;

  const capMax = skillCapMax(ll, state.skillCapBonus);
  const capUsed = skillCapUsed(state.skillTriggers);

  return {
    ll,
    tier,
    pct,
    levelCost,
    canLevelUp,
    llNextLabel,
    prCap,
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
