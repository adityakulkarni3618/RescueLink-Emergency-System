import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { API_BASE_URL } from './config/api';

// Global fetch monkey-patch to prepend backend server URL to relative /api calls in production/local environments
const originalFetch = window.fetch;
window.fetch = (input, options) => {
  let target = input;
  if (typeof input === 'string') {
    if (input.startsWith('/api') || input.startsWith('/v0.5') || input.startsWith('/health')) {
      target = `${API_BASE_URL}${input}`;
    }
  } else if (input && typeof input === 'object' && input.url && typeof input.url === 'string') {
    if (input.url.startsWith('/api') || input.url.startsWith('/v0.5') || input.url.startsWith('/health')) {
      target = new Request(`${API_BASE_URL}${input.url}`, input);
    }
  }
  return originalFetch(target, options);
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode><App /></React.StrictMode>);