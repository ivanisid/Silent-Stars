// Теги рідкісних резервів: мітки на картці й фільтр над списком.
//
// Теги нічого не забороняють — це швидкий спосіб перед грою відібрати резерви
// фракцій, з якими домовились, і відкинути решту. Фільтр — «будь-який з обраних»;
// NO_TAGS ловить резерви без жодного тегу.

export const NO_TAGS = '__none';

export function matchTags(reserve, selected) {
  if (selected.length === 0) return true;
  const ids = reserve.tagIds || [];
  return selected.some((id) => (id === NO_TAGS ? ids.length === 0 : ids.includes(id)));
}

export function TagPills({ tagIds, tags }) {
  const list = tags.filter((t) => (tagIds || []).includes(t.id));
  if (list.length === 0) return null;
  return (
    <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
      {list.map((t) => (
        <span key={t.id} className={`ss-tag${t.kind === 'faction' ? ' gm' : ''}`}>{t.name}</span>
      ))}
    </span>
  );
}

// selected — масив id тегів; onChange отримує новий масив.
export function TagFilter({ tags, selected, onChange, small }) {
  if (tags.length === 0) return null;
  const toggle = (id) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const chip = small ? 'ss-chip sm' : 'ss-chip';
  return (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
      <span style={{ fontSize: 10, color: 'var(--text-dimmer)', letterSpacing: 1, marginRight: 2 }}>ТЕГИ</span>
      <button type="button" className={`${chip}${selected.length === 0 ? ' on' : ''}`} onClick={() => onChange([])}>
        УСІ
      </button>
      {tags.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`${chip}${selected.includes(t.id) ? ' on' : ''}`}
          title={t.kind === 'faction' ? 'Фракція' : undefined}
          onClick={() => toggle(t.id)}
        >
          {t.kind === 'faction' ? '◆ ' : ''}{t.name}
        </button>
      ))}
      <button type="button" className={`${chip}${selected.includes(NO_TAGS) ? ' on' : ''}`} onClick={() => toggle(NO_TAGS)}>
        БЕЗ ТЕГІВ
      </button>
    </div>
  );
}
