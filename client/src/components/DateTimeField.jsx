import { useEffect, useState } from 'react';

// Date/time picker that opens in its own window and is typed by hand, in the
// DD.MM.YYYY HH:MM order people actually say out loud. Replaces <input
// type="datetime-local">, whose native popup is awkward and locale-dependent.

const pad = (n) => String(n).padStart(2, '0');

export function formatLocal(date) {
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Accepts "14.08.2026 19:00", "14/8/26", "14-08-2026 19", … Time is optional.
export function parseLocal(text) {
  const m = String(text)
    .trim()
    .match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})(?:[\s,]+(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (!m) return null;

  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  const hour = m[4] === undefined ? 0 : Number(m[4]);
  const minute = m[5] === undefined ? 0 : Number(m[5]);

  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;

  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  // Rejects overflow like 31.02 , which the Date constructor would roll forward.
  if (date.getDate() !== day || date.getMonth() !== month - 1 || date.getFullYear() !== year) return null;
  return date;
}

function shifted(days, hour) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
}

export default function DateTimeField({ label, value, onChange, placeholder = 'не вибрано' }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');

  useEffect(() => {
    if (open) setText(value ? formatLocal(value) : '');
  }, [open, value]);

  const parsed = parseLocal(text);
  const empty = text.trim() === '';

  function commit() {
    if (empty) {
      onChange(null);
      setOpen(false);
      return;
    }
    if (!parsed) return;
    onChange(parsed);
    setOpen(false);
  }

  return (
    <div>
      {label && <div className="field-label">{label}</div>}
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          minWidth: 190,
          textAlign: 'left',
          padding: '8px 12px',
          fontSize: 13,
          background: 'var(--input-bg)',
          border: '1px solid var(--input-border)',
          color: value ? 'var(--text-bright)' : 'var(--text-dimmer)',
          fontFamily: "'Share Tech Mono',monospace",
          cursor: 'pointer',
        }}
      >
        {value ? formatLocal(value) : placeholder}
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: '#04070cd0',
            zIndex: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 380,
              maxWidth: '100%',
              background: 'var(--panel)',
              border: '1px solid var(--panel-border)',
              boxShadow: '0 20px 60px #04070c',
            }}
          >
            <div style={{ background: 'var(--header)', padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="dot" />
              <div className="title">{label || 'ДАТА ТА ЧАС'}</div>
            </div>

            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="field-label">ВВЕДІТЬ ВРУЧНУ</div>
              <input
                type="text"
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commit();
                  if (e.key === 'Escape') setOpen(false);
                }}
                placeholder="ДД.ММ.РРРР ГГ:ХХ"
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', fontSize: 15, letterSpacing: 1 }}
              />

              <div style={{ fontSize: 11, lineHeight: 1.6, color: parsed || empty ? 'var(--text-dimmer)' : 'var(--danger)' }}>
                {empty
                  ? 'Наприклад: 14.08.2026 19:00 — час можна не вказувати.'
                  : parsed
                    ? `Буде збережено: ${formatLocal(parsed)}`
                    : 'Не вдається розпізнати. Формат: ДД.ММ.РРРР ГГ:ХХ'}
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[
                  ['СЬОГОДНІ 19:00', shifted(0, 19)],
                  ['ЗАВТРА 19:00', shifted(1, 19)],
                  ['ЧЕРЕЗ ТИЖДЕНЬ', shifted(7, 19)],
                ].map(([caption, date]) => (
                  <button
                    key={caption}
                    className="btn-ghost"
                    type="button"
                    style={{ fontSize: 11, padding: '5px 9px' }}
                    onClick={() => setText(formatLocal(date))}
                  >
                    {caption}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button className="btn" type="button" disabled={!empty && !parsed} onClick={commit}>
                  ГОТОВО
                </button>
                <button className="btn-ghost" type="button" onClick={() => setOpen(false)}>
                  СКАСУВАТИ
                </button>
                {value && (
                  <button className="btn-ghost" type="button" style={{ marginLeft: 'auto' }} onClick={() => setText('')}>
                    ОЧИСТИТИ
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
