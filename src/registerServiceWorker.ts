export const registerServiceWorker = () => {
  if (!('serviceWorker' in navigator) || window.location.hostname === 'localhost') {
    return;
  }

  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js');
  });
};