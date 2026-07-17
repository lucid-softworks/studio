export function colorSamplerReadout(color: string) {
  const value = /^#[0-9a-f]{6}$/i.test(color) ? color : '#000000'
  const red = Number.parseInt(value.slice(1, 3), 16)
  const green = Number.parseInt(value.slice(3, 5), 16)
  const blue = Number.parseInt(value.slice(5, 7), 16)
  const r = red / 255; const g = green / 255; const b = blue / 255
  const maximum = Math.max(r, g, b); const minimum = Math.min(r, g, b); const delta = maximum - minimum
  let hue = 0
  if (delta) {
    if (maximum === r) hue = 60 * (((g - b) / delta) % 6)
    else if (maximum === g) hue = 60 * ((b - r) / delta + 2)
    else hue = 60 * ((r - g) / delta + 4)
  }
  if (hue < 0) hue += 360
  const lightness = (maximum + minimum) / 2
  const saturation = delta ? delta / (1 - Math.abs(2 * lightness - 1)) : 0
  const black = 1 - maximum
  const denominator = Math.max(0.000001, 1 - black)
  return {
    rgb: [red, green, blue] as const,
    hsl: [Math.round(hue), Math.round(saturation * 100), Math.round(lightness * 100)] as const,
    cmyk: [Math.round((1 - r - black) / denominator * 100), Math.round((1 - g - black) / denominator * 100), Math.round((1 - b - black) / denominator * 100), Math.round(black * 100)] as const,
  }
}
