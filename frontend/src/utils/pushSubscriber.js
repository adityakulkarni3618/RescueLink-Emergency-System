import { API_BASE_URL } from '../config/api';

export async function registerWebPushSubscription(entityId, entityType = 'entities') {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('[WEB PUSH] Push notifications are unsupported in this environment.');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      const VAPID_PUBLIC_KEY = process.env.REACT_APP_VAPID_PUBLIC_KEY || 'BEl62iUYgUivxIkv69yViEuiBIa45b77c385b0d6a2f76816174a72d3856b37d800d3a5a73e4a2d81577c';
      const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey
      });
    }

    if (subscription && entityId) {
      const endpoint = `${API_BASE_URL}/api/${entityType}/${entityId}/push-subscription`;
      const token = sessionStorage.getItem('rescuelink_token') || '';
      
      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({ subscription })
      });
      if (res.ok) {
        console.log(`[WEB PUSH] Saved push subscription for ${entityType}/${entityId}`);
      }
    }
    return subscription;
  } catch (err) {
    console.warn('[WEB PUSH ERROR] Push subscription failed:', err.message);
    return null;
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
