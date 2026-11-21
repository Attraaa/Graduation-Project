/** Kakao Map place pages from the nearby hospital list open in the default browser. No other page leaves the app. */
export function isKakaoPlaceUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'place.map.kakao.com' && /^\/\d+$/.test(url.pathname)
  } catch {
    return false
  }
}
