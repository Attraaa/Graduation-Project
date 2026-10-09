// Keep native caption colors aligned with src/styles/tokens.css.
export function windowAppearance(theme: unknown) {
  if (theme !== 'light' && theme !== 'dark') throw new Error('잘못된 창 테마입니다.')
  return {
    backgroundColor: theme === 'dark' ? '#0f1218' : '#f3f5f8',
    titleBarOverlay: {
      color: theme === 'dark' ? '#171b23' : '#ffffff',
      symbolColor: theme === 'dark' ? '#e6e9ef' : '#1d2433',
      height: 36,
    },
  }
}
