type Bounds = { x: number; y: number; width: number; height: number }
type DisplayLike = { id: number; label?: string; bounds: Bounds }

/** Plain monitor data for the renderer; it never receives Electron objects. */
export const describeDisplays = (displays: DisplayLike[], primaryId: number, appId: number | null) => displays
  .map((display, index) => ({
    id: String(display.id),
    label: display.label?.trim() || `모니터 ${index + 1}`,
    bounds: { x: display.bounds.x, y: display.bounds.y, width: display.bounds.width, height: display.bounds.height },
    primary: display.id === primaryId,
    app: display.id === appId,
  }))
  .sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y)

/** Accepts only an id string of a currently connected display. */
export const findDisplay = <T extends { id: number }>(displays: T[], id: unknown) =>
  typeof id === 'string' && /^\d{1,20}$/.test(id) ? displays.find(display => String(display.id) === id) ?? null : null

/** A small target window centered in the display's work area. */
export const targetBounds = (area: Bounds, size = { width: 320, height: 220 }): Bounds => ({
  x: Math.round(area.x + (area.width - size.width) / 2),
  y: Math.round(area.y + (area.height - size.height) / 2),
  width: size.width,
  height: size.height,
})
