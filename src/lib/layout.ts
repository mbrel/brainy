/**
 * Shared position formula for the "act" phase's final structure — used by
 * both WireCanvas (to draw the nodes/edges) and App.tsx (to position the
 * HTML label overlay on top of them). Kept in one place so the labels
 * never drift from the dots they're labeling.
 */
export function getActPosition(index: number, total: number, isCore: boolean, vw: number, vh: number) {
  const cx = vw / 2;
  const cy = vh / 2 - 20;
  if (isCore) return { x: cx, y: cy };
  const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
  const rad = Math.min(vw, vh) * 0.2;
  return { x: cx + Math.cos(angle) * rad, y: cy + Math.sin(angle) * rad };
}
