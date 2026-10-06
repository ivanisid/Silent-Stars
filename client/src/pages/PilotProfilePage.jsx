import { useEffect, useReducer, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { pilotReducer } from '../pilot/reducer';
import { normalizePilotState } from '../pilot/pilotDefaults';
// import { WEEKLY_DOWNTIME_DATA } from '../pilot/constants'; — разом із панелі простою

import Header from '../pilot/components/Header.jsx';
import ManaPanel from '../pilot/components/ManaPanel.jsx';
import PrPanel from '../pilot/components/PrPanel.jsx';
import ShopDrawer from '../pilot/components/ShopDrawer.jsx';
import BondMenu from '../pilot/components/BondMenu.jsx';
// Панель скіл-тригерів прибрана з чарника (інтерфейс 2a); компонент і екшени лишились.
// Синхронізація (CSV / COMP/CON JSON) переїхала в меню «⋯» профілю.
// Панель «ЧАС ПРОСТОЮ» схована цілком — так само, як ангар. Разом з нею з чарника
// пішов і трекер Get Creative, який жив усередині картки, та опції Get rest.
// Компонент, WEEKLY_DOWNTIME_DATA і всі екшени редюсера лишились на місці.
// import DowntimePanel from '../pilot/components/DowntimePanel.jsx';
// Панель контактів схована — як ангар і час простою. Компонент, поле state.contacts
// і три екшени редюсера лишились на місці; записані контакти в базі не чіпані.
// import ContactsPanel from '../pilot/components/ContactsPanel.jsx';
// ActionLog is deliberately not rendered — it was dropped from the sheet, but the
// component and its reducer state are untouched, so bringing it back is an import
// and a line. The projects panel is gone entirely: its slot is now the Get Creative
// tracker inside the weekly downtime card.
import HangarPanel from '../pilot/components/HangarPanel.jsx';
import MechsPanel from '../pilot/components/MechsPanel.jsx';
import VaultPanel from '../pilot/components/VaultPanel.jsx';
import OperationsLogPanel from '../pilot/components/OperationsLogPanel.jsx';
import { PageHeader, PageShell, SyncBadge } from '../components/kit.jsx';
import { usePilotGames } from '../pilot/components/PilotGames.jsx';
import NarrativeEditor from '../pilot/components/NarrativeEditor.jsx';

import ManaTxModal from '../pilot/components/modals/ManaTxModal.jsx';
import ShopModal from '../pilot/components/modals/ShopModal.jsx';
import PrSpendModal from '../pilot/components/modals/PrSpendModal.jsx';
import LevelUpModal from '../pilot/components/modals/LevelUpModal.jsx';
import HangarConfirmModal from '../pilot/components/modals/HangarConfirmModal.jsx';

const SAVE_DEBOUNCE_MS = 800;

export default function PilotProfilePage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [pilot, setPilot] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [state, dispatch] = useReducer(pilotReducer, null);
  const [saveStatus, setSaveStatus] = useState('saved');
  // Bumped after every successful save so the history panels know to re-read.
  const [savedTick, setSavedTick] = useState(0);
  const [savedAt, setSavedAt] = useState('');
  const games = usePilotGames(id);

  // Портрет і арти мехів: окремо від state пілота, бо живуть у сховищі, а не в JSON.
  const [art, setArt] = useState({ portrait: null, mechs: {} });

  const saveTimer = useRef(null);
  const isFirstStateSet = useRef(true);

  useEffect(() => {
    let cancelled = false;
    api
      .getPilot(id)
      .then((p) => {
        if (cancelled) return;
        setPilot(p);
        isFirstStateSet.current = true;
        dispatch({ type: '__INIT__', state: normalizePilotState(p.state) });
      })
      .catch((err) => setLoadError(err.message));
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    const load = () => api.listPilotArt(id).then((a) => !cancelled && setArt(a)).catch(() => {});
    load();
    // Статус «у Foundry» проставляє синхронізатор на сервері — підхоплюємо його наживо.
    const unsubscribe = api.subscribePilotArt(id, load);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [id]);

  // Бій у Foundry (ХП, структура, заряди…) записує функція foundry-sync. Вливаємо ці
  // поля в стан у пам'яті, щоб автозбереження не затерло їх старими значеннями.
  useEffect(() => api.subscribePilot(id, (row) => {
    if (row?.state) dispatch({ type: '__FOUNDRY__', state: row.state });
  }), [id]);

  const own = pilot?.user_id === user?.id;
  async function uploadArt(kind, mechId, file) {
    await api.uploadPilotArt({ userId: user.id, pilotId: id, kind, mechId, file });
    setArt(await api.listPilotArt(id));
  }
  async function removeArt(artId) {
    await api.deleteArt(artId);
    setArt(await api.listPilotArt(id));
  }

  // After a server-side revert the in-memory state is stale, and the autosave below
  // would write it straight back over the restored one. Re-read and re-seed instead,
  // cancelling any save still pending from before the revert.
  async function reloadPilot() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const p = await api.getPilot(id);
    setPilot(p);
    isFirstStateSet.current = true;
    dispatch({ type: '__INIT__', state: normalizePilotState(p.state) });
    setSaveStatus('saved');
  }

  // Debounced autosave whenever pilot mechanics state changes.
  useEffect(() => {
    if (!state || !pilot) return;
    if (isFirstStateSet.current) {
      isFirstStateSet.current = false;
      return;
    }
    setSaveStatus('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await api.updatePilot(id, { state });
        setSaveStatus('saved');
        const now = new Date();
        setSavedAt(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
        // A save is what creates an audit row, so the history panels are stale until
        // they re-read. Without this they only ever show what existed at page load,
        // and a purchase made since looks like it was never recorded.
        setSavedTick((t) => t + 1);
      } catch {
        setSaveStatus('saved');
      }
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(saveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  async function saveMeta(patch) {
    const updated = await api.updatePilot(id, patch);
    setPilot(updated);
  }

  if (loadError) {
    return (
      <PageShell>
        <PageHeader section="ROSTER" sectionTo="/pilots" title="ПІЛОТ" />
        <div className="error-box">!! {loadError}</div>
      </PageShell>
    );
  }

  if (!pilot || !state) {
    return (
      <PageShell>
        <PageHeader section="ROSTER" sectionTo="/pilots" title="…" />
        <div className="ss-note">&gt; Завантаження…</div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        section="ROSTER"
        sectionTo="/pilots"
        title={pilot.callsign}
        right={<SyncBadge saving={saveStatus === 'saving'} at={savedAt} />}
      />
      <Header
        pilot={pilot}
        state={state}
        dispatch={dispatch}
        onSaveMeta={saveMeta}
        games={games}
        portrait={art.portrait}
        canEditArt={own}
        onUploadPortrait={(file) => uploadArt('portrait', null, file)}
        onRemoveArt={removeArt}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 22 }}>
        <ManaPanel state={state} dispatch={dispatch} />
        <PrPanel state={state} dispatch={dispatch} />
      </div>

      <BondMenu state={state} dispatch={dispatch} />
      <VaultPanel state={state} dispatch={dispatch} />
      <MechsPanel
        state={state}
        dispatch={dispatch}
        pilotId={id}
        mechArt={art.mechs}
        canEditArt={own}
        onUploadMechArt={(mechId, file) => uploadArt('mech', mechId, file)}
        onRemoveArt={removeArt}
      />
      {/* Ангар — одразу під мехами: стоянка й ліцензування стосуються саме їх. */}
      <HangarPanel state={state} dispatch={dispatch} />
      {/* <ContactsPanel state={state} dispatch={dispatch} /> — схована, див. імпорт вище */}
      <NarrativeEditor state={state} dispatch={dispatch} games={games} saving={saveStatus === 'saving'} />
      {/* Один журнал для обох ролей: свої операції гравець відкочує сам, чужі —
          ГМ. Що видно, вирішує сервер, а не ця сторінка. */}
      <OperationsLogPanel
        pilotId={id}
        refreshKey={savedTick}
        onReverted={reloadPilot}
        own={pilot?.user_id === user?.id}
      />

      <ShopDrawer state={state} dispatch={dispatch} />

      <ManaTxModal state={state} dispatch={dispatch} />
      <ShopModal state={state} dispatch={dispatch} />
      <PrSpendModal state={state} dispatch={dispatch} />
      <LevelUpModal state={state} dispatch={dispatch} />
      <HangarConfirmModal state={state} dispatch={dispatch} />
    </PageShell>
  );
}
