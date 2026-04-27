import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import LoginPage from './components/LoginPage.tsx';
import { AuthProvider, useAuth } from './contexts/AuthContext.tsx';

function SplashScreen() {
  const { statusMsg } = useAuth();
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center"
      style={{ background: 'linear-gradient(to bottom right, #f58220, #b02a30)' }}
    >
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 shadow-xl text-white font-black text-2xl"
        style={{ backgroundColor: '#8C1D21' }}
      >
        i
      </div>
      <h1 className="text-white text-xl font-black tracking-tight uppercase mb-3">RIA Assistant</h1>
      <div className="flex items-center gap-2">
        <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        <p className="text-white/80 text-[10px] font-black uppercase tracking-widest">{statusMsg}</p>
      </div>
    </div>
  );
}

function Root() {
  const { authed } = useAuth();

  if (authed === null) return <SplashScreen />;
  if (!authed) return <LoginPage />;

  return <App />;
}

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </React.StrictMode>
  );
} else {
  console.error("Critical Error: Root element '#root' not found in DOM.");
}
