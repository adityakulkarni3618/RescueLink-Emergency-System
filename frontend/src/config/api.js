export const API_BASE_URL = (process.env.REACT_APP_API_BASE_URL || process.env.REACT_APP_API_URL || '').replace(/\/$/, '');
export const SOCKET_URL = API_BASE_URL || window.location.origin;


