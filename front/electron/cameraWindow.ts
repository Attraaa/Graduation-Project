export const cameraSettingsUrl = (appUrl: string) => new URL('camera-settings.html', appUrl).href;
export const canOpenCameraSettings = (url: string, frameName: string, appUrl: string) =>
  frameName === 'moti-camera-settings' && url === cameraSettingsUrl(appUrl);
