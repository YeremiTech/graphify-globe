import { sileo } from 'sileo';

const POSITION = 'top-center';

const BASE = {
  position: POSITION,
  duration: 6500,
  roundness: 12,
  autopilot: {
    expand: 500,
    collapse: 4200,
  },
};

const FILLS = {
  success: '#0a1f16',
  error: '#1c0c0c',
  warning: '#1a1608',
  info: '#07161a',
};

const STYLES = {
  title: 'graphify-toast-title',
  description: 'graphify-toast-description',
  badge: 'graphify-toast-badge',
};

function toastOptions(fill, extra = {}) {
  return {
    ...BASE,
    fill,
    styles: STYLES,
    ...extra,
  };
}

export function notifyError(title, description) {
  return sileo.error({
    ...toastOptions(FILLS.error, { duration: 8000 }),
    title,
    description: description || undefined,
  });
}

export function notifySuccess(title, description) {
  return sileo.success({
    ...toastOptions(FILLS.success),
    title,
    description: description || undefined,
  });
}

export function notifyWarning(title, description) {
  return sileo.warning({
    ...toastOptions(FILLS.warning),
    title,
    description: description || undefined,
  });
}

export function notifyInfo(title, description) {
  return sileo.info({
    ...toastOptions(FILLS.info),
    title,
    description: description || undefined,
  });
}
