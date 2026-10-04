import { Panel, Track } from '../../components/kit.jsx';
import { nextBurdenSize, BURDEN_SIZES } from '../logic';
import { BOND_XP_PER_POWER, SHARED_MAJOR_IDEALS } from '../constants';

export default function BondMenu({ state, dispatch }) {
  const isHp = state.resourceMode === 'hp';

  return (
    <Panel
      title="BOND MENU"
      right={
        <div className="ss-seg on-bar">
          <button type="button" className={!isHp ? 'on' : ''} onClick={() => dispatch({ type: 'SET_RESOURCE_MODE', mode: 'full' })}>СТРЕС</button>
          <button type="button" className={isHp ? 'on' : ''} onClick={() => dispatch({ type: 'SET_RESOURCE_MODE', mode: 'hp' })}>ХП</button>
        </div>
      }
    >
      <div className="ss-body">
        {isHp ? (
          <div className="ss-box" style={{ maxWidth: 520 }}>
            <div className="ss-sect"><div className="ss-label">ХП ПІЛОТА · СПРОЩЕНИЙ РЕСУРС</div></div>
            <Track value={state.hp.current} max={state.hp.max} />
            <div className="ss-track-actions">
              <button type="button" className="ss-sq" onClick={() => dispatch({ type: 'DEC_HP' })} title="−1">−</button>
              <button type="button" className="ss-sq" onClick={() => dispatch({ type: 'INC_HP' })} title="+1">+</button>
            </div>
          </div>
        ) : (
          <div className="ss-grid2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))' }}>
            <BondXp state={state} dispatch={dispatch} />
            <StressBox state={state} dispatch={dispatch} />
          </div>
        )}
      </div>
    </Panel>
  );
}

function Check({ on, onClick, children, label }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      style={{
        flex: 'none',
        width: 18,
        height: 18,
        padding: 0,
        marginTop: 1,
        border: `1px solid ${on ? 'var(--accent)' : 'var(--accent-dim)'}`,
        background: on ? 'var(--header)' : 'var(--input-bg)',
        color: 'var(--btn-text)',
        fontSize: 12,
        lineHeight: '16px',
        textAlign: 'center',
      }}
    >
      {on ? '✓' : children}
    </button>
  );
}

// Bond XP: трек циклу з 8, плитка BOND POWERS у стилі COMP/CON, чекліст на гру і TALLY XP.
function BondXp({ state, dispatch }) {
  const b = state.bond;
  const xp = b.xp || 0;
  const inCycle = xp % BOND_XP_PER_POWER;
  const power = 1 + Math.max(0, Math.floor(xp / BOND_XP_PER_POWER) - (b.powerOffset || 0));
  const checks = Array.from({ length: 5 }, (_, i) => !!b.checks?.[i]);
  const count = checks.filter(Boolean).length;
  const major = [
    b.majorIdeals?.[0] || b.majorIdealFirst || 'Перший ідеал бонду — підтягніть бонд з COMP/CON (меню «⋯» у профілі).',
    b.majorIdeals?.[1] || SHARED_MAJOR_IDEALS[0],
    b.majorIdeals?.[2] || SHARED_MAJOR_IDEALS[1],
  ];
  const minors = b.minorIdeals || [];
  const toggle = (idx) => dispatch({ type: 'TOGGLE_BOND_CHECK', idx });

  const row = (i, text) => (
    <div
      key={i}
      onClick={() => toggle(i)}
      style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '7px 0', borderTop: '1px solid var(--rule)', cursor: 'pointer' }}
    >
      <Check on={checks[i]} label={text} onClick={(e) => { e.stopPropagation(); toggle(i); }} />
      <div style={{ fontSize: 12, lineHeight: 1.5, color: checks[i] ? 'var(--text-bright)' : 'var(--text-soft)', textWrap: 'pretty' }}>{text}</div>
    </div>
  );

  return (
    <div className="ss-box">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 120px', gap: 16, alignItems: 'stretch' }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 12, minWidth: 0 }}>
          <div className="ss-sect">
            <div className="ss-label">BOND XP</div>
            {b.archetype && (
              <span className="ss-tag accent" style={{ marginLeft: 'auto', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.archetype.toUpperCase()}</span>
            )}
          </div>
          <Track value={inCycle} max={BOND_XP_PER_POWER} onSeg={(idx) => dispatch({ type: 'SET_BOND_XP', idx })} label="Bond XP" />
          <div style={{ fontSize: 10, color: 'var(--text-dimmer)', letterSpacing: 1 }}>УСЬОГО {xp} XP</div>
        </div>
        <div style={{ position: 'relative', border: '1px solid var(--accent-dim)', marginTop: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '14px 10px 6px' }}>
          <div style={{ position: 'absolute', top: -7, left: '50%', transform: 'translateX(-50%)', padding: '0 6px', background: 'var(--panel-sunken)', fontSize: 10, color: 'var(--accent)', letterSpacing: 1, lineHeight: 1.2, whiteSpace: 'nowrap' }}>
            BOND POWERS
          </div>
          <div className="title-font num" style={{ flex: 1, display: 'flex', alignItems: 'center', fontSize: 44, color: 'var(--text-bright)', lineHeight: 1 }}>{power}</div>
          <button
            type="button"
            title="Повернути до 1"
            onClick={() => dispatch({ type: 'RESET_BOND_POWERS' })}
            style={{ alignSelf: 'flex-end', background: 'transparent', border: 'none', padding: 0, fontSize: 9, letterSpacing: 1, color: 'var(--text-dimmer)' }}
          >
            СКИНУТИ
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {row(0, major[0])}
        {row(1, major[1])}
        {row(2, major[2])}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderTop: '1px solid var(--rule)' }}>
          <Check on={checks[3]} label="Мінорний ідеал" onClick={() => toggle(3)} />
          <select
            className="ss-select sm"
            value={b.pick || 0}
            onChange={(e) => dispatch({ type: 'SET_BOND_PICK', value: e.target.value })}
            disabled={minors.length === 0}
            style={{ flex: 1, height: 28, textOverflow: 'ellipsis' }}
          >
            {minors.length === 0 && <option value={0}>Мінорний ідеал — з бонду COMP/CON</option>}
            {minors.map((t, i) => (
              <option key={i} value={i}>{t}</option>
            ))}
          </select>
        </div>
        {row(4, 'Boon XP from another PC.')}
      </div>
      <button
        type="button"
        className={count ? 'btn' : 'btn-ghost'}
        disabled={!count}
        style={{ height: 32, letterSpacing: 2, width: '100%' }}
        onClick={() => dispatch({ type: 'TALLY_BOND_XP' })}
      >
        TALLY XP{count ? ` · +${count}` : ''}
      </button>
    </div>
  );
}

// Стрес і burdens в одному блоці.
function StressBox({ state, dispatch }) {
  const next = nextBurdenSize(state.burdens.length);
  const emptySlots = BURDEN_SIZES.slice(state.burdens.length);
  return (
    <div className="ss-box">
      <div className="ss-sect">
        <div className="ss-label">СТРЕС</div>
        {state.downAndOut && <span className="ss-tag bad">DOWN AND OUT</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: 'var(--text-dimmer)', letterSpacing: 1 }}>ЛІМІТ</span>
          <input
            className="ss-input sm"
            type="number"
            min={1}
            value={state.stressMax}
            onChange={(e) => dispatch({ type: 'SET_STRESS_MAX', value: e.target.value })}
            style={{ width: 44, height: 24, padding: '0 6px' }}
          />
        </div>
      </div>
      <Track value={state.stress} max={state.stressMax} onSeg={(idx) => dispatch({ type: 'SET_STRESS', idx })} label="Стрес" />
      {/* Стрес не витрачається, а записується — обидві дії його додають. */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button className="btn-outline" type="button" title="Допомога: +1 ACCURACY тому, хто кидає" onClick={() => dispatch({ type: 'TAKE_STRESS', amount: 1, reason: 'допомога, +1 ACCURACY' })}>
          +1 · ДОПОМОГА
        </button>
        <button className="btn-outline" type="button" title="Push: ризикований кидок стає героїчним" onClick={() => dispatch({ type: 'TAKE_STRESS', amount: 2, reason: 'push' })}>
          +2 · PUSH
        </button>
        <button
          className="btn-ghost"
          type="button"
          style={{ marginLeft: 'auto', ...(state.downAndOut ? { color: 'var(--danger)', borderColor: 'var(--danger-border)' } : {}) }}
          onClick={() => dispatch({ type: 'TOGGLE_DOWN_AND_OUT' })}
        >
          {state.downAndOut ? 'ЗНЯТИ DOWN AND OUT' : 'DOWN AND OUT'}
        </button>
      </div>

      <div className="ss-sect" style={{ borderTop: '1px solid var(--input-border)', paddingTop: 12, marginTop: 4 }}>
        <div className="ss-label">BURDENS</div>
        <div className="ss-count">{state.burdens.length} / 3</div>
        {next == null ? (
          <span className="ss-tag bad" style={{ marginLeft: 'auto' }}>ЧЕТВЕРТИЙ BURDEN — СМЕРТЬ</span>
        ) : (
          <button className="btn-ghost sm" type="button" style={{ marginLeft: 'auto' }} onClick={() => dispatch({ type: 'ADD_BURDEN' })}>
            + BURDEN · {next} СЕГМ.
          </button>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {state.burdens.map((b) => (
          <div key={b.id} style={{ border: '1px solid var(--input-border)', background: 'var(--panel)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                className="ss-input sm"
                type="text"
                value={b.name}
                onChange={(e) => dispatch({ type: 'SET_BURDEN_NAME', id: b.id, value: e.target.value })}
                placeholder="Опишіть травму"
                style={{ flex: 1, height: 28 }}
              />
              <button type="button" className="ss-icon" style={{ width: 28, height: 28, fontSize: 12, color: 'var(--text-dimmer)' }} title="Прибрати burden" onClick={() => dispatch({ type: 'REMOVE_BURDEN', id: b.id })}>
                ✕
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--text-dimmer)', letterSpacing: 1 }}>ЛІКУВАННЯ</span>
              <Track size="sm" green value={b.healed} max={b.size} onSeg={(idx) => dispatch({ type: 'SET_BURDEN_HEALED', id: b.id, idx })} label="Лікування" />
            </div>
          </div>
        ))}
        {emptySlots.map((size, i) => (
          <div key={size} className="ss-slot">СЛОТ {state.burdens.length + i + 1} · {size} СЕГМ.</div>
        ))}
      </div>
    </div>
  );
}
