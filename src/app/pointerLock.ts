// Pointer lock with the unadjustedMovement option where supported (research 05 §4.2).
export function requestLock(el: HTMLElement): void {
  const withOptions = el.requestPointerLock as unknown as
    ((opts: { unadjustedMovement: boolean }) => Promise<void> | undefined) | undefined;
  try {
    const p = withOptions?.call(el, { unadjustedMovement: true });
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        try {
          el.requestPointerLock();
        } catch {
          /* pointer lock unavailable (headless); keyboard still works */
        }
      });
    }
  } catch {
    try {
      el.requestPointerLock();
    } catch {
      /* ignore */
    }
  }
}

export function isLocked(el: HTMLElement): boolean {
  return document.pointerLockElement === el;
}
