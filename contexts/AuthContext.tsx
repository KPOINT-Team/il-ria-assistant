import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { isAuthenticated, refreshToken, logout as clearAuth } from '../services/authService.ts';

interface AuthContextType {
  authed: boolean | null;
  setAuthed: (v: boolean) => void;
  statusMsg: string;
  handleLogout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [statusMsg, setStatusMsg] = useState('Initializing...');

  useEffect(() => {
    async function verify() {
      setStatusMsg('Checking session...');
      if (!isAuthenticated()) {
        setAuthed(false);
        return;
      }

      setStatusMsg('Refreshing session...');
      try {
        await refreshToken();
        setStatusMsg('Session verified');
        await new Promise((r) => setTimeout(r, 300));
        setAuthed(true);
      } catch (err: any) {
        if (err?.message === 'invalid_or_expired_token' || err?.message === 'client_not_found' || err?.message === 'origin_not_allowed') {
          clearAuth();
          setAuthed(false);
          return;
        }
        setStatusMsg('Offline mode');
        await new Promise((r) => setTimeout(r, 300));
        setAuthed(true);
      }
    }
    verify();
  }, []);

  const handleLogout = useCallback(() => {
    clearAuth();
    setAuthed(false);
  }, []);

  useEffect(() => {
    if (!authed) return;
    const interval = setInterval(() => {
      if (!isAuthenticated()) {
        handleLogout();
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, [authed, handleLogout]);

  return (
    <AuthContext.Provider value={{ authed, setAuthed: (v: boolean) => setAuthed(v), statusMsg, handleLogout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
