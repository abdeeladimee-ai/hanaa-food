export function configureQzSecurity() {
  // Use QZ Tray's normal local permission dialog.
  // No pairing code is required.
  return false;
}

export function clearQzPairingToken() {
  try {
    localStorage.removeItem("hanaa-qz-pairing-token");
  } catch {
    // Ignore localStorage errors.
  }
}
