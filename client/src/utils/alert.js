export const showAlert = (message, title = 'SYSTEM NOTIFICATION') => {
  window.dispatchEvent(new CustomEvent('show-custom-alert', { detail: { message, title } }));
};
