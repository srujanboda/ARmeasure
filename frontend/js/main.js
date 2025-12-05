// js/main.js
export async function supportsWebXR() {
  if (!navigator.xr) return false;
  try {
    const supported = await navigator.xr.isSessionSupported("immersive-ar");
    return supported;
  } catch (e) {
    return false;
  }
}
