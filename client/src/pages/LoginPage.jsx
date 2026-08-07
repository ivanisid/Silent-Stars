import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function LoginPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState('login');
  const [nick, setNick] = useState('');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  const isRegister = mode === 'register';

  function switchMode(m) {
    setMode(m);
    setError('');
    setSuccess('');
  }

  async function submit(e) {
    e.preventDefault();
    if (!nick.trim()) return setError('Введіть нікнейм');
    if (pass.length < 6) return setError('Пароль закороткий (мін. 6 символів)');
    if (isRegister && pass !== pass2) return setError('Паролі не збігаються');

    setBusy(true);
    setError('');
    try {
      if (isRegister) {
        await register(nick.trim(), pass);
        setSuccess(`Пілота «${nick.trim()}» зареєстровано. Тепер увійдіть.`);
        setMode('login');
        setPass('');
        setPass2('');
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

  const tabStyle = (on) => ({
    flex: 1,
    padding: '11px 0',
    fontFamily: "'Share Tech Mono',monospace",
    fontSize: 12,
    letterSpacing: 2,
    cursor: 'pointer',
    border: 'none',
    borderBottom: `2px solid ${on ? 'var(--accent)' : 'transparent'}`,
    background: on ? 'var(--panel-inset)' : 'transparent',
    color: on ? 'var(--text)' : 'var(--text-dimmer)',
  });

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        boxSizing: 'border-box',
        background: 'radial-gradient(ellipse at 50% 0%, var(--page-grad) 0%, var(--bg) 70%)',
      }}
    >
      <div style={{ width: 460, maxWidth: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 18 }}>
          <img src="/logo-ferum-vox.webp" alt="" width={40} height={40} style={{ display: 'block' }} />
          <div className="title-font" style={{ fontSize: 26, letterSpacing: 3 }}>
            FERUM-VOX // MEMBER CARD
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="title">{isRegister ? 'РЕЄСТРАЦІЯ ПІЛОТА' : 'ВХІД У СИСТЕМУ'}</div>
          </div>
          <div style={{ display: 'flex' }}>
            <button style={tabStyle(!isRegister)} onClick={() => switchMode('login')} type="button">
              ВХІД
            </button>
            <button style={tabStyle(isRegister)} onClick={() => switchMode('register')} type="button">
              РЕЄСТРАЦІЯ
            </button>
          </div>

          <form onSubmit={submit} style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div className="field-label">НІКНЕЙМ</div>
              <input
                type="text"
                value={nick}
                onChange={(e) => setNick(e.target.value)}
                placeholder="callsign"
                style={{ width: '100%', padding: '10px 12px', fontSize: 14 }}
              />
            </div>
            <div>
              <div className="field-label">ПАРОЛЬ</div>
              <input
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder="••••••••"
                style={{ width: '100%', padding: '10px 12px', fontSize: 14 }}
              />
            </div>
            {isRegister && (
              <div>
                <div className="field-label">ПОВТОРІТЬ ПАРОЛЬ</div>
                <input
                  type="password"
                  value={pass2}
                  onChange={(e) => setPass2(e.target.value)}
                  placeholder="••••••••"
                  style={{ width: '100%', padding: '10px 12px', fontSize: 14 }}
                />
              </div>
            )}

            {error && <div className="error-box">{error}</div>}
            {success && <div className="success-box">{success}</div>}

            <button className="btn" type="submit" disabled={busy}>
              {busy ? '…' : isRegister ? 'ЗАРЕЄСТРУВАТИСЬ' : 'УВІЙТИ'}
            </button>

            <div style={{ width: 12, height: 12, background: 'var(--accent)' }} />
            <div style={{ fontSize: 11, color: 'var(--text-dimmer)', textAlign: 'center' }}>
              {isRegister ? 'Вже є акаунт? Перемкніться на вкладку «Вхід».' : 'Тут в перше? Оберіть «Реєстрація».'}
            </div>
          </form>
        </div>

        <div style={{ marginTop: 14, fontSize: 10, color: 'var(--text-faint)', letterSpacing: 1, textAlign: 'center' }}>
          UNION ADMINISTRATIVE // AUTHORIZED PERSONNEL ONLY
        </div>
      </div>
    </div>
  );
}
