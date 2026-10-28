import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

function render(el: HTMLElement) {
  createRoot(el).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

// Test harness hook (task 02): compiled out unless VITE_TEST_HARNESS=1. The harness loads
// the ?fixture= scenario into the store, then renders.
if (import.meta.env.VITE_TEST_HARNESS === '1') {
  void import('./test-harness').then((harness) => harness.startHarness(() => render(root)));
} else {
  render(root);
}
