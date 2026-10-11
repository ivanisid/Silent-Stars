import { useEffect, useState } from 'react';
import { api } from '../api';
import { Msg } from './kit.jsx';

// Прив'язка Discord до акаунта апки: на сторінці «Запис на гру» — лише кнопки, поки не
// прив'язано; повне керування (стан, відв'язка) — в Account manager.
//
// Два шляхи: «Прив'язати через Discord» (OAuth — і прив'язка, і вхід через Discord) та код
// для команди /link у Discord (запасний, без входу через Discord).

function useDiscordLink(user) {
  const [link, setLink] = useState(undefined); // undefined — ще вантажиться
  const [hasLogin, setHasLogin] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try {
      setLink(await api.getDiscordLink(user.id));
      setHasLogin(await api.hasDiscordLogin());
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    if (user?.id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function run(fn) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return {
    link, hasLogin, code, busy, error, load,
    linkViaDiscord: () => run(api.linkDiscordLogin),
    makeCode: () => run(async () => setCode(await api.createDiscordLinkCode())),
    check: () => run(load),
    // Discord-вхід (OAuth) знімається разом із прив'язкою; прив'язка кодом — лише рядок.
    unlink: () => run(async () => {
      if (hasLogin) await api.unlinkDiscordLogin();
      else await api.unlinkDiscord(user.id);
      setCode('');
      await load();
    }),
  };
}

const CODE_HINT = 'Згенерувати код для команди /link. Використовуйте команду та код, щоб зв\'язати свій профіль і Discord.';

function LinkButtons({ d }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <button className="btn md" type="button" disabled={d.busy} onClick={d.linkViaDiscord}
        title="Дозволяє увійти в акаунт через Discord. Синхронізує записи на сайті та Discord-сервері.">
        ПРИВ'ЯЗАТИ ЧЕРЕЗ DISCORD
      </button>
      <button className="btn-ghost md" type="button" disabled={d.busy} onClick={d.makeCode} title={CODE_HINT}>
        КОД ДЛЯ КОМАНДИ В DISCORD
      </button>
      {d.code && (
        <>
          <code style={{ color: 'var(--accent)', fontSize: 14, letterSpacing: 2, userSelect: 'all' }} title="Введіть у Discord: /link і цей код. Діє 15 хв">
            /link {d.code}
          </code>
          <button className="btn-ghost md" type="button" disabled={d.busy} onClick={d.check} title="Перевірити, чи прив'язка вже спрацювала">
            ПЕРЕВІРИТИ
          </button>
        </>
      )}
    </div>
  );
}

// Сторінка «Запис на гру»: лише кнопки, і лише поки Discord не прив'язано.
export function DiscordLinkButtons({ user }) {
  const d = useDiscordLink(user);
  if (d.link !== null && !d.error) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <LinkButtons d={d} />
      {d.error && <Msg kind="err">{d.error}</Msg>}
    </div>
  );
}

// Account manager: стан прив'язки, прив'язати, відв'язати.
export function DiscordAccountSection({ user }) {
  const d = useDiscordLink(user);
  // Акаунт, створений через Discord, без пароля: відв'язка забрала б єдиний спосіб входу.
  const noOtherLogin = d.hasLogin && !user?.byNick;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="field-label" style={{ marginBottom: 0 }}>DISCORD</div>
      {d.link === undefined && !d.error && <div className="ss-note">Перевіряю…</div>}
      {d.link === null && (
        <>
          <div style={{ color: 'var(--text-dimmer)', fontSize: 12 }}>○ Не прив'язано</div>
          <LinkButtons d={d} />
        </>
      )}
      {d.link && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--success)', fontSize: 12 }}>
            ● Прив'язано{d.link.discord_username ? ` · ${d.link.discord_username}` : ''}
            {d.hasLogin ? ' · вхід через Discord увімкнено' : ''}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {!d.hasLogin && (
              <button className="btn-ghost sm" type="button" disabled={d.busy} onClick={d.linkViaDiscord}
                title="Після цього можна входити в апку кнопкою «Увійти через Discord» — у цей самий акаунт">
                УВІМКНУТИ ВХІД ЧЕРЕЗ DISCORD
              </button>
            )}
            <button className="btn-ghost sm" type="button" disabled={d.busy || noOtherLogin} onClick={d.unlink}
              title={noOtherLogin ? 'Спершу задайте пароль нижче — інакше не буде чим увійти' : 'Відв\'язати Discord від цього акаунта'}>
              ВІДВ'ЯЗАТИ
            </button>
          </div>
        </div>
      )}
      {noOtherLogin && d.link && (
        <div className="ss-note">Акаунт створено через Discord: щоб відв'язати його, спершу задайте пароль нижче.</div>
      )}
      {d.error && <Msg kind="err">{d.error}</Msg>}
    </div>
  );
}
