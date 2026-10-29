import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getSession, login as loginRequest, logout as logoutRequest } from '../api/admin.js';

const AdminAuthContext = createContext(null);

export function AdminAuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [checking, setChecking] = useState(true);
  const [sessionError, setSessionError] = useState('');

  const refreshSession = useCallback(async () => {
    setChecking(true);
    setSessionError('');
    try {
      const session = await getSession();
      setAdmin(session.authenticated ? session.admin : null);
      return session.authenticated ? session.admin : null;
    } catch (error) {
      setSessionError(error.message);
      throw error;
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    getSession()
      .then((session) => {
        if (active) {
          setAdmin(session.authenticated ? session.admin : null);
          setSessionError('');
        }
      })
      .catch((error) => {
        if (active) {
          setAdmin(null);
          setSessionError(error.message);
        }
      })
      .finally(() => {
        if (active) setChecking(false);
      });

    const expireSession = () => setAdmin(null);
    window.addEventListener('startuptn:session-expired', expireSession);
    return () => {
      active = false;
      window.removeEventListener('startuptn:session-expired', expireSession);
    };
  }, []);

  const signIn = useCallback(async (credentials) => {
    setSessionError('');
    const authenticatedAdmin = await loginRequest(credentials);
    setAdmin(authenticatedAdmin);
    setChecking(false);
    return authenticatedAdmin;
  }, []);

  const signOut = useCallback(async () => {
    await logoutRequest();
    setAdmin(null);
  }, []);

  const value = useMemo(
    () => ({ admin, checking, sessionError, signIn, signOut, refreshSession }),
    [admin, checking, sessionError, signIn, signOut, refreshSession]
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (!context) throw new Error('useAdminAuth must be used within AdminAuthProvider.');
  return context;
}
