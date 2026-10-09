import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api';
import pkg from '../../package.json';

// Вхід — текстовий режим без вікна: пункти «[1] ВХІД» / «[2] РЕЄСТРАЦІЯ» розгортають
// дерево полів, згори й знизу біжать декоративні логи. Сторінка завжди в GMS Dark
// (клас ss-login перевизначає змінні теми).

const SRC = [
  'PKT RX node-03 → node-07 512b', 'SYNC registry delta +2', 'PING relay/evergreen 41ms', 'AUTH token refresh',
  'GC heap 63% ok', 'TELEMETRY mech hp sync', 'LOG write ops', 'WARN retry uplink 1/3', 'CACHE miss pilot:portrait',
  'PR ledger checkpoint', 'SCAN sector 4C clear', 'QUEUE board slots', 'CRC ok 0x9F3A', 'RX beacon UNION-ADM', 'ARCHIVE rotate',
];
const pad = (n) => String(n).padStart(2, '0');
function mkLine() {
  const d = new Date();
  return {
    id: Math.random(),
    t: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`,
    text: `${SRC[Math.floor(Math.random() * SRC.length)]} · ${Math.random().toString(16).slice(2, 10)}`,
  };
}
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function useLog(interval, prepend) {
  const [lines, setLines] = useState(() => Array.from({ length: 14 }, mkLine));
  useEffect(() => {
    if (reducedMotion()) return undefined;
    const t = setInterval(() => setLines((l) => (prepend ? [mkLine(), ...l.slice(0, 13)] : [...l.slice(-13), mkLine()])), interval);
    return () => clearInterval(t);
  }, [interval, prepend]);
  return lines;
}

export default function LoginPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState(null); // null | 'login' | 'register'
  const [rev, setRev] = useState(0); // скільки рядків дерева вже показано
  const [nick, setNick] = useState('');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(new Date());
  const revTimer = useRef(null);

  const logTop = useLog(700, false);
  const logBot = useLog(950, true);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearInterval(t);
      clearInterval(revTimer.current);
    };
  }, []);

  const isRegister = mode === 'register';

  // Клік розгортає дерево під пунктом (рядки по одному, крок 90 мс), другий клік згортає.
  function toggle(m) {
    clearInterval(revTimer.current);
    const next = mode === m ? null : m;
    setMode(next);
    setError('');
    if (next !== 'login') setSuccess('');
    setRev(0);
    if (!next) return;
    if (reducedMotion()) return setRev(9);
    revTimer.current = setInterval(() => {
      setRev((r) => {
        if (r >= 4) {
          clearInterval(revTimer.current);
          return r;
        }
        return r + 1;
      });
    }, 90);
  }

  async function submit(e) {
    e.preventDefault();
    if (!nick.trim()) return setError('Введіть нікнейм');
    if (pass.length < 6) return setError('Пароль закороткий (мін. 6 символів)');
    if (new TextEncoder().encode(pass).length > 72) return setError('Пароль задовгий (макс. 72 байти — приблизно 72 латинські символи)');
    if (isRegister && pass !== pass2) return setError('Паролі не збігаються');

    setBusy(true);
    setError('');
    try {
      if (isRegister) {
        await register(nick.trim(), pass);
        // Одразу входимо тим самим паролем: так він перевіряється одразу, а не при
        // наступному вході, коли згенерований браузером пароль уже ніхто не пам'ятає.
        try {
          await login(nick.trim(), pass);
          navigate('/pilots');
          return;
        } catch (err) {
          setSuccess('');
          setMode('login');
          setRev(9);
          setPass2('');
          throw new Error(`Акаунт «${nick.trim()}» створено, але вхід не вдався: ${err.message}`);
        }
      } else {
        await login(nick.trim(), pass);
        navigate('/pilots');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function discord() {
    setBusy(true);
    setError('');
    try {
      await api.loginWithDiscord(); // далі браузер іде на Discord і повертається вже з сесією
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const item = (m, num, label) => {
    const on = mode === m;
    return (
      <button type="button" className="lg-item" onClick={() => toggle(m)} aria-expanded={on} style={{ color: on ? 'var(--text-bright)' : mode ? 'var(--text-faint)' : 'var(--text)' }}>
        <span style={{ color: 'var(--accent)', width: 16 }}>{on ? '▾' : '>'}</span>
        <span style={{ color: 'var(--text-faint)', fontSize: 13, letterSpacing: 1 }}>[{num}]</span>
        <span>{label}</span>
      </button>
    );
  };

  // Поля в DOM одразу (а не після анімації розгортання): менеджер паролів браузера
  // шукає їх, щойно форма з'явилась, і пізніше доданих може не заповнити. Розгортання
  // рядок за рядком — лише видимість.
  const field = (shown, last, label, input) => (
    <div className="lg-row" style={{ opacity: shown ? 1 : 0, transition: 'opacity .12s' }}>
      <span className="lg-tree">{last ? '└─' : '├─'}</span>
      <span className="lg-lbl">{label}</span>
      {input}
    </div>
  );
  const eye = (
    <button type="button" className="lg-eye" onClick={() => setShow((v) => !v)} title={show ? 'Сховати пароль' : 'Показати пароль'} aria-pressed={show}>
      {show ? '[сховати]' : '[показати]'}
    </button>
  );

  const tree = (m) =>
    mode === m && (
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column' }}>
        {field(rev >= 1, false, 'НІКНЕЙМ:', <input className="lg-in" type="text" name="username" id={`${m}-username`} autoFocus autoComplete="username" autoCapitalize="off" spellCheck={false} value={nick} onChange={(e) => setNick(e.target.value)} placeholder="callsign" />)}
        {field(rev >= 2, false, 'ПАРОЛЬ:', <><input className="lg-in" type={show ? 'text' : 'password'} name="password" id={`${m}-password`} autoComplete={m === 'register' ? 'new-password' : 'current-password'} autoCapitalize="off" spellCheck={false} value={pass} onChange={(e) => setPass(e.target.value)} placeholder="••••••••" />{eye}</>)}
        {m === 'register' && field(rev >= 3, false, 'ПОВТОР:', <input className="lg-in" type={show ? 'text' : 'password'} name="password-repeat" id="register-password-repeat" autoComplete="new-password" autoCapitalize="off" spellCheck={false} value={pass2} onChange={(e) => setPass2(e.target.value)} placeholder="••••••••" />)}
        {rev >= (m === 'register' ? 4 : 3) && (
          <div className="lg-row">
            <span className="lg-tree">└─</span>
            <button type="submit" className="lg-submit" disabled={busy}>
              <span style={{ color: 'var(--accent)' }}>&gt;&gt;</span>
              <span>{busy ? 'ЗАЧЕКАЙТЕ…' : m === 'register' ? 'ЗАРЕЄСТРУВАТИСЬ' : 'УВІЙТИ'}</span>
              <span className="lg-cursor" />
            </button>
          </div>
        )}
        {error && <div style={{ fontSize: 12, color: 'var(--danger)', padding: '4px 0 4px 36px', whiteSpace: 'normal' }}>!! {error}</div>}
      </form>
    );

  return (
    <div
      className="ss-login"
      style={{ position: 'relative', isolation: 'isolate', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '0 24px 0 max(24px, 12vw)', overflow: 'hidden' }}
    >
      <div className="ss-grid" aria-hidden="true" />
      <div className="lg-log top" aria-hidden="true">
        {logTop.map((l) => (
          <div key={l.id}><span>{l.t}</span> {l.text}</div>
        ))}
      </div>
      <div style={{ flex: 'none', width: 520, maxWidth: '100%', position: 'relative', padding: '16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 12, fontSize: 10, color: 'var(--text-dimmer)', letterSpacing: 2 }}>
          <span style={{ color: 'var(--accent)' }}>■</span>
          <span>FERUM-VOX // AUTH</span>
          <span style={{ marginLeft: 'auto' }}>NODE 07 · {pad(now.getHours())}:{pad(now.getMinutes())}:{pad(now.getSeconds())}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', fontSize: 12, lineHeight: 1.5 }}>
          {item('login', 1, 'ВХІД')}
          {success && mode === 'login' && <div style={{ fontSize: 12, color: 'var(--success)', padding: '0 0 4px 36px' }}>&gt;&gt; {success}</div>}
          {tree('login')}
          {item('register', 2, 'РЕЄСТРАЦІЯ')}
          {tree('register')}
          <div style={{ height: 14 }} />
          <button type="button" className="lg-item" disabled={busy} onClick={discord} style={{ height: 30, fontSize: 12, letterSpacing: 1, color: 'var(--text-dimmer)' }}>
            <span style={{ color: 'var(--text-faint)' }}>[D]</span>
            <span>УВІЙТИ ЧЕРЕЗ DISCORD</span>
          </button>
          {error && !mode && <div style={{ fontSize: 12, color: 'var(--danger)' }}>!! {error}</div>}
        </div>
        <div style={{ display: 'flex', paddingTop: 14, fontSize: 10, color: 'var(--text-grey)', letterSpacing: 1 }}>
          <span style={{ marginLeft: 'auto' }}>v{pkg.version}</span>
        </div>
      </div>
      <div className="lg-log bot" aria-hidden="true">
        {logBot.map((l) => (
          <div key={l.id}><span>{l.t}</span> {l.text}</div>
        ))}
      </div>
    </div>
  );
}
