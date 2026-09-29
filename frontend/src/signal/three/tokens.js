/** Read a SIGNAL palette token ("212 162 76") as a 0..1 RGB triple for three.js. */
export function tokenRGB(name) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--s-${name}`).trim()
  const [r, g, b] = raw.split(/\s+/).map(Number)
  if ([r, g, b].some((n) => Number.isNaN(n))) return [1, 1, 1]
  return [r / 255, g / 255, b / 255]
}
