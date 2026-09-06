export const API_BASE_URL = (process.env.REACT_APP_API_BASE_URL || process.env.REACT_APP_API_URL || 'https://rescuelink-emergency-system-4d85.onrender.com').replace(/\/$/, '');
export const SOCKET_URL = API_BASE_URL;
