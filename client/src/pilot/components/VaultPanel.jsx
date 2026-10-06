import { useMemo, useState } from 'react';
import { Menu, Panel, useConfirm } from '../../components/kit.jsx';
import { rareReserveByKey, anyReserveByKey, useRareCatalog, RARE_RANKS } from '../rareReserves';
import { TagFilter, TagPills, matchTags } from './ReserveTags.jsx';
import { derivePilotView } from '../derive';
import ReserveIcon from './ReserveIcon.jsx';
import { RESERVES, RESERVE_CATEGORIES, reserveByKey } from '../reserves';

// Склад рідкісних резервів. Не магазин: тут нічого не купується й не витрачається —
// гравець записує те, що видали як частину нагороди за місію. На складі резерв лежить
// і не згорає; «взяти на місію» перекладає його на руки, де він згорить після місії.
export default function VaultPanel({ state, dispatch }) {
  // Підписка на каталог: назви резервів на складі з'являються, щойно він завантажився.
  const { tags } = useRareCatalog();
  // null | 'rare' | 'common' — на якій вкладці відкрито меню вибору.
  const [picking, setPicking] = useState(null);
  const [ask, dialog] = useConfirm();
  const vault = state.vault || [];
  // Кап приходить із derive — там же, де й решта похідних величин пілота.
  const cap = derivePilotView(state).vaultCap;
  const full = vault.length >= cap;
  const onHand = state.reserves || [];

  async function writeOff(v, def) {
    const ok = await ask({
      title: 'СПИСАТИ РЕЗЕРВ?',
      tone: 'danger',
      lines: [`«${def?.name || v.key}»`, 'резерв зникне зі складу'],
      yesLabel: 'СПИСАТИ',
    });
    if (ok) dispatch({ type: 'REMOVE_FROM_VAULT', id: v.id });
  }

  async function burn() {
    const burning = onHand.filter((r) => r.gamesLeft != null && r.gamesLeft <= 1);
    const ok = await ask({
      title: 'КІНЕЦЬ МІСІЇ',
      tone: 'danger',
      question: 'Спалити резерви, узяті на місію?',
      lines: [
        burning.length ? `згорить: ${burning.map((r) => anyReserveByKey(r.key)?.name || r.key).join(', ')}` : 'нічого не згорить — лише оновиться термін дії',
        'резерви, що діють кілька ігор, втратять одну',
      ],
      yesLabel: 'СПАЛИТИ',
    });
    if (ok) dispatch({ type: 'BURN_MISSION_RESERVES' });
  }

  return (
    <Panel title="СКЛАД РЕЗЕРВІВ">
      {dialog}
      <div className="ss-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 14, alignItems: 'stretch' }}>
        <div className="ss-box">
          <div className="ss-sect">
            <div className="ss-label">НА СКЛАДІ</div>
            <div className="ss-count" style={{ color: full ? 'var(--warn)' : undefined }}>{vault.length} / {cap}</div>
            <button className="btn-ghost sm" type="button" style={{ marginLeft: 'auto' }} disabled={full} title={full ? 'Склад заповнений — звільніть місце' : undefined} onClick={() => setPicking('rare')}>
              + ЗАПИСАТИ РЕЗЕРВ
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {vault.map((v) => {
              const def = rareReserveByKey(v.key);
              return (
                <div key={v.id} className="m-vault" style={{ border: '1px solid var(--input-border)', background: 'var(--panel)', padding: '10px 12px', display: 'grid', gridTemplateColumns: '32px minmax(0,1fr) auto', gap: 12, alignItems: 'center' }}>
                  <ReserveIcon kind="rare" title="Рідкісний резерв" size={32} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, color: 'var(--text-bright)' }}>{def?.name || v.key}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-dimmer)', letterSpacing: 1 }}>
                        РАНГ {def?.rank ?? '?'} · {def?.action || '—'}{def?.traits ? ` · ${def.traits}` : ''}
                      </span>
                      {def && <TagPills tagIds={def.tagIds} tags={tags} />}
                    </div>
                    {def?.desc && <div style={{ fontSize: 11, color: 'var(--text-dimmer)', lineHeight: 1.55 }}>{def.desc}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-outline md" type="button" onClick={() => dispatch({ type: 'TAKE_VAULT_TO_MISSION', id: v.id })}>
                      НА МІСІЮ →
                    </button>
                    <Menu small items={[{ label: 'СПИСАТИ…', danger: true, onClick: () => writeOff(v, def) }]} />
                  </div>
                </div>
              );
            })}
            {Array.from({ length: Math.max(0, cap - vault.length) }, (_, i) => (
              <div key={i} className="ss-slot" style={{ minHeight: 54 }}>ВІЛЬНЕ МІСЦЕ</div>
            ))}
          </div>
          <div className="ss-note" style={{ marginTop: 'auto' }}>
            На складі резерв не згорає. Ціну рідкісного резерву в PR задає ГМ — її видно в довіднику.
          </div>
        </div>

        {/* Резерви «на руках» — і куплені за PR, і взяті зі складу: склад → на руках → згоріло. */}
        <div className="ss-box">
          <div className="ss-sect">
            <div className="ss-label">НА РУКАХ</div>
            <div className="ss-count">{onHand.length}</div>
            <button className="btn-ghost sm" type="button" style={{ marginLeft: 'auto' }} onClick={() => setPicking('common')}>
              + ЗАПИСАТИ РЕЗЕРВ
            </button>
          </div>
          {onHand.length === 0 ? (
            <div className="ss-slot" style={{ minHeight: 54 }}>НІЧОГО НЕ ВЗЯТО</div>
          ) : (
            <div className="ss-list">
              {onHand.map((r, i) => {
                const def = anyReserveByKey(r.key);
                return (
                  <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '32px minmax(0,1fr) auto 26px', gap: 12, alignItems: 'center', padding: '8px 12px', background: 'var(--panel)', borderTop: i ? '1px solid var(--input-border)' : 'none' }}>
                    <ReserveIcon kind={reserveByKey(r.key)?.category || 'rare'} size={32} />
                    <span style={{ color: 'var(--text)', minWidth: 0, overflowWrap: 'anywhere' }}>{def?.name || r.key}</span>
                    <span style={{ fontSize: 10, color: r.gamesLeft == null ? 'var(--text-dimmer)' : 'var(--warn)', letterSpacing: 1, whiteSpace: 'nowrap' }}>
                      {r.gamesLeft == null ? 'НЕ ЗГОРАЄ' : `${r.gamesLeft} ${r.gamesLeft === 1 ? 'ГРА' : 'ІГОР'}`}
                    </span>
                    <Menu small items={[{ label: 'ВИКОРИСТАНО / ПРИБРАТИ', onClick: () => dispatch({ type: 'REMOVE_RESERVE', id: r.id }) }]} />
                  </div>
                );
              })}
            </div>
          )}
          <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div className="ss-note" style={{ flex: 1, minWidth: 160 }}>Узяті на місію резерви згорають після неї.</div>
            <button className="btn-danger" type="button" disabled={onHand.length === 0} onClick={burn}>
              КІНЕЦЬ МІСІЇ — СПАЛИТИ
            </button>
          </div>
        </div>
      </div>

      {picking && (
        <PickModal
          initialTab={picking}
          vaultFull={full}
          onClose={() => setPicking(null)}
          onPick={(tab, key) => {
            dispatch({ type: tab === 'rare' ? 'ADD_TO_VAULT' : 'ADD_RESERVE_TO_HAND', key });
            setPicking(null);
          }}
        />
      )}
    </Panel>
  );
}

// Меню вибору: РІДКІСНІ ідуть на склад (поки є місце), ЗВИЧАЙНІ — одразу на руки.
function PickModal({ initialTab = 'rare', vaultFull, onClose, onPick }) {
  const [tab, setTab] = useState(initialTab);
  const [rank, setRank] = useState(1);
  const [category, setCategory] = useState('all');
  const [q, setQ] = useState('');
  const [tagSel, setTagSel] = useState([]);
  const { reserves: rareList, tags } = useRareCatalog();
  const rare = tab === 'rare';
  const ranks = rare ? RARE_RANKS : [1, 2, 3];

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const match = (r) => needle === '' || r.name.toLowerCase().includes(needle) || r.desc.toLowerCase().includes(needle);
    if (rare) return rareList.filter((r) => !r.archived && r.rank === rank && matchTags(r, tagSel) && match(r));
    return RESERVES.filter((r) => r.rank === rank && (category === 'all' || r.category === category) && match(r));
  }, [rare, rank, category, q, tagSel, rareList]);

  const blocked = rare && vaultFull;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-box"
        style={{ width: 620, maxHeight: '82vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">ЗАПИСАТИ РЕЗЕРВ</div>
        <div className="modal-body" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="ss-seg" style={{ display: 'flex' }}>
            <button type="button" className={rare ? 'on' : ''} style={{ flex: 1 }} onClick={() => { setTab('rare'); setRank(1); }}>
              РІДКІСНІ · НА СКЛАД
            </button>
            <button type="button" className={!rare ? 'on' : ''} style={{ flex: 1 }} onClick={() => { setTab('common'); setRank(1); setCategory('all'); }}>
              ЗВИЧАЙНІ · НА РУКИ
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {ranks.map((rk) => (
              <button key={rk} type="button" className={`ss-chip${rank === rk ? ' on' : ''}`} onClick={() => setRank(rk)}>
                РАНГ {rk}
              </button>
            ))}
            <input
              type="text"
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="/ пошук"
              className="ss-input sm"
              style={{ flex: 1, minWidth: 160 }}
            />
          </div>
          {rare && <TagFilter small tags={tags} selected={tagSel} onChange={setTagSel} />}
          {!rare && (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: -4 }}>
              <button type="button" className={`ss-chip sm${category === 'all' ? ' on' : ''}`} onClick={() => setCategory('all')}>УСІ</button>
              {RESERVE_CATEGORIES.map((c) => (
                <button key={c.key} type="button" className={`ss-chip sm${category === c.key ? ' on' : ''}`} onClick={() => setCategory(c.key)}>
                  {c.label}
                </button>
              ))}
            </div>
          )}

          <div className="ss-note">
            {rare
              ? blocked
                ? ':: Склад заповнений — звільніть місце, щоб записати рідкісний резерв.'
                : 'Рідкісний резерв ляже на склад і не згорить, доки його не взяли на місію.'
              : 'Звичайний резерв одразу піде на руки й згорить після місії. PR не списуються — купівля за PR лишилась у магазині.'}
          </div>

          <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 4 }}>
            {list.map((r) => (
              <button
                key={r.key}
                type="button"
                disabled={blocked}
                onClick={() => onPick(tab, r.key)}
                style={{
                  textAlign: 'left',
                  padding: '9px 11px',
                  background: 'var(--input-bg)',
                  border: '1px solid var(--input-border)',
                  color: 'var(--text)',
                  cursor: blocked ? 'not-allowed' : 'pointer',
                  opacity: blocked ? 0.5 : 1,
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                }}
              >
                <ReserveIcon kind={rare ? 'rare' : r.category} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-bright)' }}>{r.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-dimmer)', marginTop: 3 }}>
                    {rare
                      ? `${r.pricePr} PR · ${r.action}${r.traits ? ` · ${r.traits}` : ''}`
                      : RESERVE_CATEGORIES.find((c) => c.key === r.category)?.label || r.category}
                  </div>
                  {rare && r.tagIds.length > 0 && (
                    <div style={{ marginTop: 5 }}><TagPills tagIds={r.tagIds} tags={tags} /></div>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--text-soft-dim)', lineHeight: 1.5, marginTop: 5 }}>{r.desc}</div>
                </div>
              </button>
            ))}
            {list.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-dimmer)' }}>&gt; Нічого не знайдено.</div>}
          </div>

          <button className="btn-ghost" type="button" onClick={onClose} style={{ alignSelf: 'flex-end', flexShrink: 0 }}>
            ЗАКРИТИ
          </button>
        </div>
      </div>
    </div>
  );
}
