import { LEVEL_UP_GRANTS, LEVEL_UP_WARNING, REDISTRIBUTE_ALL_COST } from '../../constants';
import { manaLevelCost } from '../../logic';
import { MechSelect } from './shared';

function Extra({ label, checked, cost, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        boxSizing: 'border-box',
        textAlign: 'left',
        padding: '9px 12px',
        fontSize: 12,
        background: checked ? 'var(--header)' : 'var(--input-bg)',
        color: 'var(--text)',
        border: `1px solid ${checked ? 'var(--accent)' : 'var(--input-border)'}`,
      }}
    >
      <span style={{ color: checked ? 'var(--accent)' : 'var(--text-dimmer)' }}>{checked ? '▪' : '▫'}</span>
      <span style={{ flex: 1 }}>{label}</span>
      <span style={{ color: 'var(--accent)', whiteSpace: 'nowrap' }}>+{cost} М</span>
    </button>
  );
}

export default function LevelUpModal({ state, dispatch }) {
  const lu = state.levelUp;
  if (!lu.open) return null;

  const base = manaLevelCost(state.ll);
  const extras =
    (lu.allTalents ? REDISTRIBUTE_ALL_COST : 0) + (lu.allLicenses ? REDISTRIBUTE_ALL_COST : 0);
  const total = base + extras;
  const after = state.mana.balance - total;
  const affordable = after >= 0;

  return (
    <div className="modal-backdrop" onClick={() => dispatch({ type: 'CLOSE_LEVEL_UP' })}>
      <div className="modal-box" style={{ width: 520, maxWidth: '92vw' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">ПІДВИЩЕННЯ ЛІЦЕНЗІЇ · ЛЛ {state.ll} → {state.ll + 1}</div>
        <div className="modal-body">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <div className="title-font" style={{ fontSize: 30, color: affordable ? 'var(--text-bright)' : 'var(--danger)' }}>
              {total} М
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              баланс {state.mana.balance} → {after}
            </div>
          </div>

          <div>
            <div className="field-label">ПІДВИЩЕННЯ ДАЄ</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text-soft-dim)', lineHeight: 1.7 }}>
              {LEVEL_UP_GRANTS.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </div>

          {state.mechs.length > 0 && (
            <div>
              <div className="field-label">МЕХ ДЛЯ ПОВНОГО РЕМОНТУ</div>
              <MechSelect
                mechs={state.mechs}
                mechId={lu.mechId}
                onPick={(id) => dispatch({ type: 'SET_LEVEL_UP_MECH', mechId: id })}
              />
            </div>
          )}

          <div>
            <div className="field-label">ДОДАТКОВО, ЗА ОКРЕМУ ПЛАТУ</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Extra
                label="Перерозподілити всі таланти"
                checked={lu.allTalents}
                cost={REDISTRIBUTE_ALL_COST}
                onToggle={() => dispatch({ type: 'TOGGLE_LEVEL_UP_EXTRA', field: 'allTalents' })}
              />
              <Extra
                label="Перерозподілити всі ліцензії"
                checked={lu.allLicenses}
                cost={REDISTRIBUTE_ALL_COST}
                onToggle={() => dispatch({ type: 'TOGGLE_LEVEL_UP_EXTRA', field: 'allLicenses' })}
              />
            </div>
          </div>

          {/* Таланти, ліцензії та мех-скіли живуть у COMP/CON, не тут — додаток фіксує
              право на перерозподіл і списує ману, а самі зміни гравець робить у себе. */}
          <div style={{ fontSize: 11, color: 'var(--text-dimmer)', lineHeight: 1.6, borderLeft: '2px solid var(--rule)', paddingLeft: 10 }}>
            {LEVEL_UP_WARNING}
            <br />
            Сам перерозподіл робиться в COMP/CON — тут фіксується лише витрата й право на нього.
          </div>

          {lu.error && <div className="error-box">{lu.error}</div>}

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="btn"
              type="button"
              style={{ flex: 1, opacity: affordable ? 1 : 0.55, cursor: affordable ? 'pointer' : 'not-allowed' }}
              disabled={!affordable}
              onClick={() => dispatch({ type: 'CONFIRM_LEVEL_UP' })}
            >
              ПІДВИЩИТИ ЗА {total} М
            </button>
            <button className="btn-ghost" type="button" style={{ flex: 1 }} onClick={() => dispatch({ type: 'CLOSE_LEVEL_UP' })}>
              СКАСУВАТИ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
