import type { AdjustmentDescriptor } from './types'

export const adjustmentKinds: Array<{ value: AdjustmentDescriptor['type']; label: string }> = [
  { value: 'brightness/contrast', label: 'Brightness / Contrast' },
  { value: 'levels', label: 'Levels' },
  { value: 'curves', label: 'Curves' },
  { value: 'exposure', label: 'Exposure' },
  { value: 'vibrance', label: 'Vibrance' },
  { value: 'hue/saturation', label: 'Hue / Saturation' },
  { value: 'color balance', label: 'Color Balance' },
  { value: 'black & white', label: 'Black & White' },
  { value: 'photo filter', label: 'Photo Filter' },
  { value: 'channel mixer', label: 'Channel Mixer' },
  { value: 'color lookup', label: 'Color Lookup' },
  { value: 'invert', label: 'Invert' },
  { value: 'posterize', label: 'Posterize' },
  { value: 'threshold', label: 'Threshold' },
  { value: 'gradient map', label: 'Gradient Map' },
  { value: 'selective color', label: 'Selective Color' },
  { value: 'camera raw', label: 'Camera Raw' },
]

export function createAdjustmentDescriptor(type: AdjustmentDescriptor['type']): AdjustmentDescriptor {
  switch (type) {
    case 'brightness/contrast': return { type, brightness: 0, contrast: 0, useLegacy: false, labColorOnly: false, auto: false }
    case 'levels': return { type, rgb: { shadowInput: 0, highlightInput: 255, shadowOutput: 0, highlightOutput: 255, midtoneInput: 1 } }
    case 'curves': return { type, rgb: [{ input: 0, output: 0 }, { input: 255, output: 255 }] }
    case 'exposure': return { type, exposure: 0, offset: 0, gamma: 1 }
    case 'vibrance': return { type, vibrance: 0, saturation: 0 }
    case 'hue/saturation': return { type, master: { range: [0, 0, 0, 0], hue: 0, saturation: 0, lightness: 0 } }
    case 'color balance': return { type, shadows: { cyanRed: 0, magentaGreen: 0, yellowBlue: 0 }, midtones: { cyanRed: 0, magentaGreen: 0, yellowBlue: 0 }, highlights: { cyanRed: 0, magentaGreen: 0, yellowBlue: 0 }, preserveLuminosity: true }
    case 'black & white': return { type, reds: 40, yellows: 60, greens: 40, cyans: 60, blues: 20, magentas: 80, useTint: false, tintColor: '#ffffff' }
    case 'photo filter': return { type, color: '#ec8a00', density: 25, preserveLuminosity: true }
    case 'channel mixer': return { type, monochrome: false, red: { red: 100, green: 0, blue: 0, constant: 0 }, green: { red: 0, green: 100, blue: 0, constant: 0 }, blue: { red: 0, green: 0, blue: 100, constant: 0 } }
    case 'color lookup': return { type, dither: false }
    case 'invert': return { type }
    case 'posterize': return { type, levels: 4 }
    case 'threshold': return { type, level: 128 }
    case 'gradient map': return { type, name: 'Black, White', gradientType: 'solid', dither: false, reverse: false, colorStops: [{ color: '#000000', position: 0, midpoint: 50 }, { color: '#ffffff', position: 1, midpoint: 50 }], opacityStops: [{ opacity: 1, position: 0, midpoint: 50 }, { opacity: 1, position: 1, midpoint: 50 }] }
    case 'selective color': return { type, mode: 'relative', neutrals: { c: 0, m: 0, y: 0, k: 0 } }
    case 'camera raw': return { type, temperature: 0, tint: 0, exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, texture: 0, clarity: 0, dehaze: 0, vibrance: 0, saturation: 0 }
  }
}
