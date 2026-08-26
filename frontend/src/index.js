import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Global fetch monkey-patch to prepend backend server URL to relative /api calls in production/local environments
const originalFetch = window.fetch;
window.fetch = (url, options) => {
  const SERVER_URL = process.env.REACT_APP_API_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : 'https://rescuelink-emergency-system.onrender.com');
  const targetUrl = typeof url === 'string' && url.startsWith('/api') ? `${SERVER_URL}${url}` : url;
  return originalFetch(targetUrl, options);
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode><App /></React.StrictMode>);