import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { SettingsProvider } from '@/settings/SettingsProvider';
import '@/styles/index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Element #root introuvable');

createRoot(container).render(
  <StrictMode>
    <SettingsProvider>
      <App />
    </SettingsProvider>
  </StrictMode>,
);
