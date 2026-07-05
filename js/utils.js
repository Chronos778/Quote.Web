let activeToastTimeout = null;

export function showToast(message = 'Copied to clipboard') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('visible');

  if (activeToastTimeout) clearTimeout(activeToastTimeout);
  activeToastTimeout = setTimeout(() => {
    toast.classList.remove('visible');
  }, 3000);
}

export function vibrate(pattern = [50]) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Ignored
    }
  }
}
