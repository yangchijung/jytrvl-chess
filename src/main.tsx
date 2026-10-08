import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/noto-serif-tc/700.css';
import './index.css';
import { App } from './App';
import { I18nProvider } from './i18n';
import { SettingsProvider } from './lib/settings';
import { AuthProvider } from './lib/auth';
import { reportError } from './lib/api';

window.addEventListener('error', (e) => reportError(e.message, { src: e.filename, line: e.lineno }));
window.addEventListener('unhandledrejection', (e) => reportError(String(e.reason)));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <I18nProvider>
        <SettingsProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </SettingsProvider>
      </I18nProvider>
    </BrowserRouter>
  </StrictMode>,
);
