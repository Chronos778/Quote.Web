let apiBase = '';
let showToastFn = () => {};

export const PushNotificationManager = {
  async init(config) {
    if (config?.apiBase) apiBase = config.apiBase;
    if (config?.showToast) showToastFn = config.showToast;

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      this.updateBellUI(!!subscription);
    } catch (e) {
      console.warn('Failed to get push subscription', e);
    }
  },

  updateBellUI(isSubscribed) {
    const icon = document.getElementById('bell-icon');
    const label = document.getElementById('bell-label');
    if (icon) {
      icon.classList.toggle('filled', isSubscribed);
    }
    if (label) {
      label.textContent = isSubscribed ? 'Subscribed' : 'Daily Quote';
    }
  },

  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
  },

  async toggle() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      showToastFn('Push notifications not supported by your browser');
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        // Notify server first, then unsubscribe locally
        try {
          const unsubResponse = await fetch(`${apiBase}/push/unsubscribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: subscription.endpoint }),
          });
          if (!unsubResponse.ok) {
            console.warn('Server rejected push unsubscribe', unsubResponse.status);
          }
        } catch (e) {
          console.warn('Server push unsubscribe failed', e);
        }
        await subscription.unsubscribe();
        this.updateBellUI(false);
        showToastFn('Notifications disabled');
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          showToastFn('Notification permission denied');
          return;
        }

        const publicKey = window.QUOTE_WEB_CONFIG?.vapidPublicKey;
        if (!publicKey) {
          showToastFn('VAPID key not configured');
          return;
        }

        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: this.urlBase64ToUint8Array(publicKey),
        });

        const subResponse = await fetch(`${apiBase}/push/subscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription }),
        });
        if (!subResponse.ok) {
          console.warn('Server rejected push subscribe', subResponse.status);
        }

        this.updateBellUI(true);
        showToastFn('Subscribed to daily quotes');
      }
    } catch (error) {
      console.warn('Push toggle failed', error);
      showToastFn('Failed to toggle notifications');
      this.updateBellUI(false);
    }
  },
};
