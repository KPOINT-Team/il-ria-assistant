import React, { useState } from 'react';
import { login } from '../services/authService.ts';
import { useAuth } from '../contexts/AuthContext.tsx';

export default function LoginPage() {
  const { setAuthed } = useAuth();
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(clientId, clientSecret);
      setAuthed(true);
    } catch (err: any) {
      setError(
        err.message === 'invalid_credentials'
          ? 'Invalid Client ID or Secret'
          : err.message === 'origin_not_allowed'
          ? 'This origin is not allowed for the provided client.'
          : 'Login failed. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'linear-gradient(to bottom right, #00457b, #00457b)' }}
    >
      <div className="w-full max-w-sm bg-white rounded-[32px] shadow-2xl p-10 border border-slate-100">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-black text-slate-800 tracking-tight ">KPOINT Auth. </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="clientId"
              className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 ml-1"
            >
              Client ID
            </label>
            <input
              id="clientId"
              type="text"
              required
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-5 font-black text-sm focus:border-orange-500 outline-none transition-all shadow-inner"
              placeholder="Enter your Client ID"
              disabled={loading}
            />
          </div>

          <div>
            <label
              htmlFor="clientSecret"
              className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 ml-1"
            >
              Client Secret
            </label>
            <input
              id="clientSecret"
              type="password"
              required
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-5 font-black text-sm focus:border-orange-500 outline-none transition-all shadow-inner"
              placeholder="Enter your Client Secret"
              disabled={loading}
            />
          </div>

          {error && (
            <p className="text-[11px] text-red-600 font-black bg-red-50 rounded-xl py-3 px-4 text-center leading-tight">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full text-white py-4 rounded-2xl font-black uppercase text-[11px] tracking-widest shadow-xl transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ backgroundColor: '#4582ec' }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-[9px] text-slate-400 font-black uppercase tracking-[0.3em] mt-8">
          Nibhaye Vaade Since 2001
        </p>
      </div>
    </div>
  );
}
