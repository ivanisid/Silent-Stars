import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '../api';
import { supabase } from '../supabaseClient';

const AuthContext = createContext(null);

function sessionToUser(session) {
  if (!session?.user) return null;
  return { id: session.user.id, nick: session.user.user_metadata?.nick || '' };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  // null = role not resolved yet (or logged out); 'player' | 'gm' once fetched.
  const [role, setRole] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(sessionToUser(data.session));
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(sessionToUser(session));
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setRole(null);
      return undefined;
    }
    let cancelled = false;
    api
      .getMyRole(user.id)
      .then((r) => {
        if (!cancelled) setRole(r);
      })
      .catch(() => {
        if (!cancelled) setRole('player');
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const login = useCallback(async (nick, password) => {
    const { user: u } = await api.login(nick, password);
    setUser(u);
    return u;
  }, []);

  const register = useCallback(async (nick, password) => {
    return api.register(nick, password);
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
  }, []);

  const isAuthed = ready && !!user;
  const isGm = role === 'gm';

  return (
    <AuthContext.Provider value={{ user, isAuthed, ready, role, isGm, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
