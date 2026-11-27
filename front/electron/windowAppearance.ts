// Keep native caption colors aligned with src/styles/tokens.css.
export function windowAppearance(theme: unknown, dimmed = false) {
  if (theme !== 'light' && theme !== 'dark') throw new Error('잘못된 창 테마입니다.')
  const dark = theme === 'dark';
  return {
    backgroundColor: dark ? '#0f1218' : '#f3f5f8',
    titleBarOverlay: {
      // Equivalent to modal.css's 35% backdrop over the normal caption colors.
      color: dimmed ? (dark ? '#151a24' : '#acaeb3') : (dark ? '#171b23' : '#ffffff'),
      symbolColor: dimmed ? (dark ? '#9ba0a9' : '#19202f') : (dark ? '#e6e9ef' : '#1d2433'),
      height: 36,
    },
  }
}
