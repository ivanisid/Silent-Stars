import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api';

// Дані входу: зміна ніку й пароля. Відкривається з лівої рейки.
//
// Нік — це й логін: після зміни входити треба вже з новим. Акаунт, створений через
// Discord, пароля не має — тут його можна задати, і тоді з'явиться вхід за ніком.
// Поля мають autocomplete-підказки, щоб менеджер паролів браузера оновив збережене.

function PassInput({ value, onChange, autoComplete, name, show, placeholder }) {
  return (
    <input
      className="ss-input"
      type={show ? 'text' : 'password'}
      name={name}
      autoComplete={autoComplete}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      spellCheck={false}
      autoCapitalize="off"
      style={{ width: '100%' }}
    />
  );
}

export default function AccountDialog({ onClose }) {
  const { user } = useAuth();
  const [nick, setNick] = useState(user?.nick || '');
  const [nickMsg, setNickMsg] = useState(null);
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [show, setShow] = useState(false);
  const [passMsg, setPassMsg] = useState(null);
  const [busy, setBusy] = useState('');
  const byNick = !!user?.byNick;

  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  async function saveNick(e) {
    e.preventDefault();
    const n = nick.trim();
    if (!n) return setNickMsg({ ok: false, t: 'Введіть нікнейм.' });
    if (n === (user?.nick || '').trim()) return setNickMsg({ ok: true, t: 'Нікнейм не змінився.' });
    setBusy('nick');
    setNickMsg(null);
    try {
      const r = await api.updateAccount({ action: 'nick', nick: n });
      setNickMsg({
        ok: true,
        t: r?.login ? `Нікнейм змінено. Тепер входьте як «${n}» з тим самим паролем.` : `Нікнейм змінено на «${n}».`,
      });
    } catch (err) {
      setNickMsg({ ok: false, t: err.message });
    } finally {
      setBusy('');
    }
  }

  async function savePass(e) {
    e.preventDefault();
    if (pass.length < 6) return setPassMsg({ ok: false, t: 'Пароль закороткий (мін. 6 символів).' });
    if (pass !== pass2) return setPassMsg({ ok: false, t: 'Паролі не збігаються.' });
    setBusy('pass');
    setPassMsg(null);
    try {
      const r = await api.updateAccount({ action: 'password', password: pass });
      setPass('');
      setPass2('');
      setPassMsg({
        ok: true,
        t: byNick
          ? 'Пароль змінено. Якщо браузер запропонує оновити збережений пароль — погодьтесь.'
          : `Пароль задано. Тепер можна входити й за ніком «${r?.nick || user?.nick}».`,
      });
    } catch (err) {
      setPassMsg({ ok: false, t: err.message });
    } finally {
      setBusy('');
    }
  }

  const msg = (m) => m && <div className={m.ok ? 'success-box' : 'error-box'}>{m.ok ? '>>' : '!!'} {m.t}</div>;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" style={{ width: 440 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-header">ДАНІ ВХОДУ</div>
        <div className="modal-body" style={{ gap: 18 }}>
          <form onSubmit={saveNick} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="field-label" style={{ marginBottom: 0 }}>НІКНЕЙМ {byNick && <span style={{ color: 'var(--text-faint)' }}>· він же логін</span>}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="ss-input"
                name="username"
                autoComplete="username"
                value={nick}
                onChange={(e) => setNick(e.target.value)}
                maxLength={40}
                style={{ flex: 1 }}
              />
              <button type="submit" className="btn" disabled={busy === 'nick'}>{busy === 'nick' ? '…' : 'ЗБЕРЕГТИ'}</button>
            </div>
            {msg(nickMsg)}
          </form>

          <form onSubmit={savePass} style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px dashed var(--input-border)', paddingTop: 16 }}>
            {/* Логін поруч із паролем — щоб менеджер паролів знав, до якого запису він належить. */}
            <input type="text" name="username" autoComplete="username" value={user?.nick || ''} readOnly hidden />
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div className="field-label" style={{ marginBottom: 0 }}>{byNick ? 'ЗМІНИТИ ПАРОЛЬ' : 'ЗАДАТИ ПАРОЛЬ'}</div>
              <button type="button" className="btn-ghost sm" style={{ marginLeft: 'auto' }} onClick={() => setShow((v) => !v)}>
                {show ? 'СХОВАТИ' : 'ПОКАЗАТИ'}
              </button>
            </div>
            {!byNick && (
              <div className="ss-note">
                Акаунт створено через Discord, пароля в нього немає. Задайте пароль — і зможете входити й за ніком «{user?.nick}».
              </div>
            )}
            <PassInput value={pass} onChange={setPass} name="new-password" autoComplete="new-password" show={show} placeholder="новий пароль (мін. 6 символів)" />
            <PassInput value={pass2} onChange={setPass2} name="new-password-repeat" autoComplete="new-password" show={show} placeholder="повтор нового пароля" />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn" disabled={busy === 'pass'}>{busy === 'pass' ? '…' : byNick ? 'ЗМІНИТИ ПАРОЛЬ' : 'ЗАДАТИ ПАРОЛЬ'}</button>
            </div>
            {msg(passMsg)}
          </form>

          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>ЗАКРИТИ</button>
          </div>
        </div>
      </div>
    </div>
  );
}
