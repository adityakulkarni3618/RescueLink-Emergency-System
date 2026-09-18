export const API_BASE_URL = (process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:5000').replace(/\/$/, '');
export const SOCKET_URL = API_BASE_URL;
