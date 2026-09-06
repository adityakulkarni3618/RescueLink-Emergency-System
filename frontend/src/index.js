import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { API_BASE_URL } from './config/api';

// Global fetch monkey-patch to prepend backend server URL to relative /api calls in production/local environments
const originalFetch = window.fetch;
window.fetch = (url, options) => {
  const targetUrl = typeof url === 'string' && url.startsWith('/api') ? `${API_BASE_URL}${url}` : url;
  return originalFetch(targetUrl, options);
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode><App /></React.StrictMode>);