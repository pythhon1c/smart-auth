"use strict";

// Both timestamps must come from the same clock. Main should use performance.now()
// so changing the wall clock cannot postpone an already running inactivity timer.
function idleLockAction({
  lastInteraction,
  now,
  settings = {},
  pinEnabled = false,
  lockMode = "unlocked",
} = {}) {
  if (lockMode === "password") return null;
  if (!["unlocked", "pin"].includes(lockMode)) return null;
  if (
    !Number.isFinite(lastInteraction) ||
    !Number.isFinite(now) ||
    now < lastInteraction
  )
    return null;
  const elapsed = now - lastInteraction;
  const passwordMinutes =
    settings.passwordLockMinutes ?? settings.autoLockMinutes ?? 10;
  const pinMinutes = settings.pinLockMinutes ?? 2;
  // Full password escalation uses the original interaction time even in PIN mode.
  // A PIN lock is not activity and must never restart this longer deadline.
  if (
    Number.isFinite(passwordMinutes) &&
    passwordMinutes > 0 &&
    elapsed >= passwordMinutes * 60000
  )
    return "password";
  if (
    lockMode === "unlocked" &&
    pinEnabled === true &&
    Number.isFinite(pinMinutes) &&
    pinMinutes > 0 &&
    elapsed >= pinMinutes * 60000
  )
    return "pin";
  return null;
}
module.exports = { idleLockAction };
