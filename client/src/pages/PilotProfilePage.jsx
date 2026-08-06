import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { pilotReducer } from '../pilot/reducer';
import { MISSION_DOWNTIME_DATA, WEEKLY_DOWNTIME_DATA } from '../pilot/constants';

import Header from '../pilot/components/Header.jsx';
import SyncTools from '../pilot/components/SyncTools.jsx';
import ManaPanel from '../pilot/components/ManaPanel.jsx';
import DcStorePanel from '../pilot/components/DcStorePanel.jsx';
import ShopDrawer from '../pilot/components/ShopDrawer.jsx';
import BondMenu from '../pilot/components/BondMenu.jsx';
import SkillTriggers from '../pilot/components/SkillTriggers.jsx';
import DowntimePanel from '../pilot/components/DowntimePanel.jsx';
import ContactsPanel from '../pilot/components/ContactsPanel.jsx';
import ProjectsPanel from '../pilot/components/ProjectsPanel.jsx';
import HangarPanel from '../pilot/components/HangarPanel.jsx';
import MechsPanel from '../pilot/components/MechsPanel.jsx';
import ActionLog from '../pilot/components/ActionLog.jsx';
import GmAuditPanel from '../pilot/components/GmAuditPanel.jsx';
import NavDrawer from '../pilot/components/NavDrawer.jsx';
import NarrativeEditor from '../pilot/components/NarrativeEditor.jsx';

import ManaTxModal from '../pilot/components/modals/ManaTxModal.jsx';
import DcRepairModal from '../pilot/components/modals/DcRepairModal.jsx';
import ShopModal from '../pilot/components/modals/ShopModal.jsx';
import BufModal from '../pilot/components/modals/BufModal.jsx';
import HangarConfirmModal from '../pilot/components/modals/HangarConfirmModal.jsx';

const SAVE_DEBOUNCE_MS = 800;

export default function PilotProfilePage() {
  const { id } = useParams();
  const { isGm } = useAuth();
  const [pilot, setPilot] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [state, dispatch] = useReducer(pilotReducer, null);
  const [saveStatus, setSaveStatus] = useState('saved');

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
        dispatch({ type: '__INIT__', state: p.state });
      })
      .catch((err) => setLoadError(err.message));
    return () => {
      cancelled = true;
    };
  }, [id]);

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

  const containerStyle = useMemo(
    () => ({
      minHeight: '100vh',
      background: '#070b12',
      backgroundImage: 'radial-gradient(#132033 1px, transparent 1px)',
      backgroundSize: '22px 22px',
      color: 'var(--text)',
      paddingBottom: 80,
    }),
    [],
  );

  if (loadError) {
    return (
      <div style={{ padding: 40 }}>
        <div className="error-box">{loadError}</div>
      </div>
    );
  }

  if (!pilot || !state) {
    return (
      <div style={{ padding: 40, color: 'var(--text-dimmer)' }}>Завантаження…</div>
    );
  }

  return (
    <div style={containerStyle}>
      <Header pilot={pilot} state={state} dispatch={dispatch} onSaveMeta={saveMeta} saveStatus={saveStatus} />

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px 0 24px', display: 'flex', flexDirection: 'column', gap: 26 }}>
        <SyncTools dispatch={dispatch} />

        <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 320 }}>
            <ManaPanel state={state} dispatch={dispatch} />
          </div>
          <div style={{ flex: 1, minWidth: 320 }}>
            <DcStorePanel state={state} dispatch={dispatch} />
          </div>
        </div>

        <BondMenu state={state} dispatch={dispatch} />
        <MechsPanel state={state} dispatch={dispatch} />
        <SkillTriggers state={state} dispatch={dispatch} />
        <ContactsPanel state={state} dispatch={dispatch} />
        <ProjectsPanel state={state} dispatch={dispatch} />
        <DowntimePanel
          state={state}
          dispatch={dispatch}
          data={MISSION_DOWNTIME_DATA}
          pool="mission"
          title="ДАУНТАЙМ"
          capLabel="1 / НА МІСІЮ"
          resetLabel="НОВА МІСІЯ"
        />
        <DowntimePanel
          state={state}
          dispatch={dispatch}
          data={WEEKLY_DOWNTIME_DATA}
          pool="weekly"
          title="ЧАС ПРОСТОЮ"
          capLabel="1 / НА ТИЖДЕНЬ"
          resetLabel="НОВИЙ ТИЖДЕНЬ"
        />
        <HangarPanel state={state} dispatch={dispatch} />
        <NarrativeEditor state={state} dispatch={dispatch} />
        <ActionLog state={state} dispatch={dispatch} />
        {isGm && <GmAuditPanel pilotId={id} />}
      </div>

      <ShopDrawer state={state} dispatch={dispatch} />
      <NavDrawer />

      <ManaTxModal state={state} dispatch={dispatch} />
      <DcRepairModal state={state} dispatch={dispatch} />
      <ShopModal state={state} dispatch={dispatch} />
      <BufModal state={state} dispatch={dispatch} />
      <HangarConfirmModal state={state} dispatch={dispatch} />
    </div>
  );
}
