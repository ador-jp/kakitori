import { registerSW } from 'virtual:pwa-register';

type WorkState = { unjudgedAnswer: boolean; activeTest: boolean };

export function registerSafeUpdate(getState: () => WorkState) {
  let pending = false;
  const applyIfSafe = () => {
    if (!pending) return;
    const { unjudgedAnswer, activeTest } = getState();
    if (unjudgedAnswer || activeTest) return;
    pending = false;
    location.reload();
  };
  registerSW({ immediate: true, onNeedReload: () => { pending = true; applyIfSafe(); } });
  const afterInteraction = () => { setTimeout(applyIfSafe, 0); };
  document.addEventListener('click', afterInteraction);
  document.addEventListener('change', afterInteraction);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') applyIfSafe();
  });
}
