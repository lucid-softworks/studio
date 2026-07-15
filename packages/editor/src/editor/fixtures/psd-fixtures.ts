import type { Layer, PixelData, Psd } from 'ag-psd'

function pixels(width: number, height: number, colors: ReadonlyArray<readonly [number, number, number, number]>): PixelData {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let index = 0; index < width * height; index += 1) data.set(colors[index % colors.length], index * 4)
  return { width, height, data }
}

function layer(name: string, imageData: PixelData, extra: Partial<Layer> = {}): Layer {
  return { name, left: 0, top: 0, right: imageData.width, bottom: imageData.height, imageData, ...extra }
}

const red = pixels(3, 2, [[220, 35, 45, 255]])
const blueAlpha = pixels(3, 2, [[30, 90, 220, 160], [30, 90, 220, 0]])
const composite = pixels(3, 2, [
  [101, 69, 155, 255], [220, 35, 45, 255], [101, 69, 155, 255],
  [220, 35, 45, 255], [101, 69, 155, 255], [220, 35, 45, 255],
])
const mask = pixels(3, 2, [[255, 255, 255, 255], [0, 0, 0, 255]])

export type PsdFixture = {
  name: string
  psb?: boolean
  document: Psd
  editorOrder: string[]
}

export const psdFixtures: PsdFixture[] = [
  {
    name: 'layered-rgb-8bit',
    document: {
      width: 3,
      height: 2,
      colorMode: 3,
      bitsPerChannel: 8,
      imageData: composite,
      children: [
        layer('Highlight', blueAlpha, { blendMode: 'screen', opacity: 0.8 }),
        layer('Background', red),
      ],
    },
    editorOrder: ['Background', 'Highlight'],
  },
  {
    name: 'groups-masks-effects-psb',
    psb: true,
    document: {
      width: 3,
      height: 2,
      colorMode: 3,
      bitsPerChannel: 8,
      imageData: composite,
      children: [{
        name: 'Artwork',
        opened: true,
        children: [
          layer('Masked glow', blueAlpha, {
            mask: { left: 0, top: 0, right: 3, bottom: 2, defaultColor: 255, imageData: mask },
            effects: {
              outerGlow: { enabled: true, color: { r: 120, g: 80, b: 240 }, opacity: 0.6, size: { units: 'Pixels', value: 4 } },
            },
          }),
          layer('Base', red),
        ],
      }],
    },
    editorOrder: ['Artwork / Base', 'Artwork / Masked glow'],
  },
]
