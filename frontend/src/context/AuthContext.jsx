import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken, setUnauthenticatedHandler } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // "loading" covers the first round-trip that turns a stored token back into a
  // user, so the app never flashes the sign-in screen at someone already signed in.
  const [loading, setLoading] = useState(true);

  const signOut = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);


  // Carries e.g. "this account has been suspended" through to the login screen,
  // so being kicked out mid-session explains itself.
  const [endedReason, setEndedReason] = useState('');

  useEffect(() => {
    setUnauthenticatedHandler((reason) => {
      setUser(null);
      if (reason) setEndedReason(reason);
    });
    return () => setUnauthenticatedHandler(null);
  }, []);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api.auth.me()
      .then(({ user: me }) => setUser(me))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const accept = useCallback(({ user: me, token }) => {
    setToken(token);
    setUser(me);
    return me;
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    isAdmin: user?.role === 'admin',
    endedReason,
    clearEndedReason: () => setEndedReason(''),
    signIn: async (credentials) => accept(await api.auth.login(credentials)),
    signUp: async (details) => accept(await api.auth.register(details)),
    signOut,
    updateProfile: async (details) => {
      const { user: updated } = await api.auth.updateProfile(details);
      setUser(updated);
      return updated;
    },
    changePassword: (details) => api.auth.changePassword(details),
  }), [user, loading, endedReason, accept, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside an AuthProvider');
  return ctx;
}
