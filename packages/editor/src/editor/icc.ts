import type { AdjustmentDescriptor } from './types'
import type { DocumentColorSettings, IccProfileReference } from './types'

type ColorLookup = Extract<AdjustmentDescriptor, { type: 'color lookup' }>
type LittleCms = typeof import('@kittl/little-cms')
type Formats = typeof import('@kittl/little-cms/formats')
type Flags = typeof import('@kittl/little-cms/flags')

let modulePromise: Promise<{ lcms: LittleCms; formats: Formats; flags: Flags }> | undefined

async function littleCms() {
  if (!modulePromise) {
    modulePromise = Promise.all([
      import('@kittl/little-cms'),
      import('@kittl/little-cms/formats'),
      import('@kittl/little-cms/flags'),
    ]).then(async ([lcms, formats, flags]) => {
      const initialized = await lcms.initWasm()
      void initialized.valueOrThrow
      return { lcms, formats, flags }
    })
  }
  return modulePromise
}

function intentValue(lcms: LittleCms, intent: DocumentColorSettings['intent']) {
  return intent === 'perceptual' ? lcms.CmsIntent.Percepttual : intent === 'absolute' ? lcms.CmsIntent.AbsoluteColorimetric : lcms.CmsIntent.RelativeColorimetric
}

function profileFormat(lcms: LittleCms, formats: Formats, profile: Parameters<LittleCms['cmsGetColorSpace']>[0]) {
  const space = lcms.cmsGetColorSpace(profile).valueOrThrow
  if (space === lcms.IccColorSpaceMap.CMYK) return formats.TYPE_CMYK_8
  if (space === lcms.IccColorSpaceMap.GRAY) return formats.TYPE_GRAY_8
  return formats.TYPE_RGB_8
}

export async function inspectIccProfile(bytes: Uint8Array): Promise<IccProfileReference> {
  const fallback = new TextDecoder('ascii').decode(bytes.slice(16, 20)).trim() || 'ICC profile'
  const { lcms } = await littleCms()
  const profile = lcms.cmsOpenProfileFromMem(bytes).valueOrThrow
  try {
    const description = lcms.cmsGetProfileInfoASCII(profile, lcms.CmsPrintInfoType.Description, 'en', 'US').value
    return { name: description?.trim() || fallback, bytes: [...bytes] }
  } finally { lcms.cmsCloseProfile(profile) }
}

export async function convertIccImageData(pixels: ImageData, source: IccProfileReference | undefined, target: IccProfileReference, intent: DocumentColorSettings['intent'], blackPointCompensation: boolean) {
  const { lcms, formats, flags } = await littleCms()
  const sourceProfile = source?.bytes.length ? lcms.cmsOpenProfileFromMem(Uint8Array.from(source.bytes)).valueOrThrow : lcms.cmsCreate_sRGBProfile().valueOrThrow
  const targetProfile = lcms.cmsOpenProfileFromMem(Uint8Array.from(target.bytes)).valueOrThrow
  const displayProfile = lcms.cmsCreate_sRGBProfile().valueOrThrow
  let toTarget: ReturnType<typeof lcms.cmsCreateTransform>['value']
  let toDisplay: ReturnType<typeof lcms.cmsCreateTransform>['value']
  try {
    let transformFlags = flags.iniFlags()
    transformFlags = flags.setBlackPointCompensation(transformFlags, blackPointCompensation)
    const targetFormat = profileFormat(lcms, formats, targetProfile)
    toTarget = lcms.cmsCreateTransform(sourceProfile, formats.TYPE_RGB_8, targetProfile, targetFormat, intentValue(lcms, intent), transformFlags).valueOrThrow
    toDisplay = lcms.cmsCreateTransform(targetProfile, targetFormat, displayProfile, formats.TYPE_RGB_8, intentValue(lcms, intent), transformFlags).valueOrThrow
    const rgb = new Uint8Array(pixels.width * pixels.height * 3)
    for (let pixel = 0; pixel < pixels.width * pixels.height; pixel += 1) rgb.set(pixels.data.slice(pixel * 4, pixel * 4 + 3), pixel * 3)
    const encoded = lcms.cmsDoTransform(toTarget, rgb, pixels.width * pixels.height).valueOrThrow
    const display = lcms.cmsDoTransform(toDisplay, encoded, pixels.width * pixels.height).valueOrThrow
    const output = new ImageData(pixels.width, pixels.height)
    for (let pixel = 0; pixel < pixels.width * pixels.height; pixel += 1) {
      output.data.set(display.slice(pixel * 3, pixel * 3 + 3), pixel * 4)
      output.data[pixel * 4 + 3] = pixels.data[pixel * 4 + 3]
    }
    return output
  } finally {
    if (toTarget) lcms.cmsDeleteTransform(toTarget)
    if (toDisplay) lcms.cmsDeleteTransform(toDisplay)
    lcms.cmsCloseProfile(sourceProfile)
    lcms.cmsCloseProfile(targetProfile)
    lcms.cmsCloseProfile(displayProfile)
  }
}

export async function bakeProofProfile(profile: IccProfileReference, intent: DocumentColorSettings['intent'], blackPointCompensation: boolean, size = 17) {
  const input = lutInputs(size)
  const pixels = new ImageData(size ** 3, 1)
  for (let pixel = 0; pixel < size ** 3; pixel += 1) { pixels.data.set(input.slice(pixel * 3, pixel * 3 + 3), pixel * 4); pixels.data[pixel * 4 + 3] = 255 }
  const converted = await convertIccImageData(pixels, undefined, profile, intent, blackPointCompensation)
  const data: number[] = []
  const gamut: number[] = []
  for (let pixel = 0; pixel < size ** 3; pixel += 1) {
    data.push(converted.data[pixel * 4], converted.data[pixel * 4 + 1], converted.data[pixel * 4 + 2])
    gamut.push(Math.abs(converted.data[pixel * 4] - input[pixel * 3]) + Math.abs(converted.data[pixel * 4 + 1] - input[pixel * 3 + 1]) + Math.abs(converted.data[pixel * 4 + 2] - input[pixel * 3 + 2]) > 36 ? 1 : 0)
  }
  return { size, data, gamut }
}

function lutInputs(size: number) {
  const input = new Uint8Array(size ** 3 * 3)
  let offset = 0
  for (let blue = 0; blue < size; blue += 1) {
    for (let green = 0; green < size; green += 1) {
      for (let red = 0; red < size; red += 1) {
        input[offset++] = Math.round(red / (size - 1) * 255)
        input[offset++] = Math.round(green / (size - 1) * 255)
        input[offset++] = Math.round(blue / (size - 1) * 255)
      }
    }
  }
  return input
}

function srgbToLab(input: Uint8Array) {
  const output = new Uint8Array(input.length)
  const pivot = (value: number) => value > 0.04045 ? ((value + 0.055) / 1.055) ** 2.4 : value / 12.92
  const lab = (value: number) => value > 216 / 24_389 ? Math.cbrt(value) : (24_389 / 27 * value + 16) / 116
  for (let index = 0; index < input.length; index += 3) {
    const red = pivot(input[index] / 255)
    const green = pivot(input[index + 1] / 255)
    const blue = pivot(input[index + 2] / 255)
    const x = (0.4360747 * red + 0.3850649 * green + 0.1430804 * blue) / 0.96422
    const y = 0.2225045 * red + 0.7168786 * green + 0.0606169 * blue
    const z = (0.0139322 * red + 0.0971045 * green + 0.7141733 * blue) / 0.82521
    const fx = lab(x)
    const fy = lab(y)
    const fz = lab(z)
    output[index] = Math.round(Math.max(0, Math.min(100, 116 * fy - 16)) / 100 * 255)
    output[index + 1] = Math.round(Math.max(-128, Math.min(127, 500 * (fx - fy))) + 128)
    output[index + 2] = Math.round(Math.max(-128, Math.min(127, 200 * (fy - fz))) + 128)
  }
  return output
}

function labToSrgb(input: Uint8Array) {
  const output = new Uint8Array(input.length)
  const pivot = (value: number) => value ** 3 > 216 / 24_389 ? value ** 3 : (116 * value - 16) / (24_389 / 27)
  const srgb = (value: number) => value > 0.0031308 ? 1.055 * value ** (1 / 2.4) - 0.055 : 12.92 * value
  for (let index = 0; index < input.length; index += 3) {
    const lightness = input[index] / 255 * 100
    const a = input[index + 1] - 128
    const b = input[index + 2] - 128
    const fy = (lightness + 16) / 116
    const x = 0.96422 * pivot(fy + a / 500)
    const y = pivot(fy)
    const z = 0.82521 * pivot(fy - b / 200)
    const red = srgb(3.1338561 * x - 1.6168667 * y - 0.4906146 * z)
    const green = srgb(-0.9787684 * x + 1.9161415 * y + 0.033454 * z)
    const blue = srgb(0.0719453 * x - 0.2289914 * y + 1.4052427 * z)
    output[index] = Math.round(Math.max(0, Math.min(1, red)) * 255)
    output[index + 1] = Math.round(Math.max(0, Math.min(1, green)) * 255)
    output[index + 2] = Math.round(Math.max(0, Math.min(1, blue)) * 255)
  }
  return output
}

export async function bakeIccColorLookup(adjustment: ColorLookup, size = 17): Promise<ColorLookup> {
  if (!adjustment.profile?.length || (adjustment.lookupType !== 'abstractProfile' && adjustment.lookupType !== 'deviceLinkProfile')) return adjustment
  try {
    const { lcms, formats, flags } = await littleCms()
    const profile = lcms.cmsOpenProfileFromMem(Uint8Array.from(adjustment.profile)).valueOrThrow
    let transform: ReturnType<typeof lcms.cmsCreateTransform>['value']
    try {
      let transformFlags = flags.iniFlags()
      transformFlags = flags.setNoCache(transformFlags, true)
      transformFlags = flags.setHighResPrecalc(transformFlags, true)
      const format = adjustment.lookupType === 'abstractProfile' ? formats.TYPE_Lab_8 : formats.TYPE_RGB_8
      transform = lcms.cmsCreateTransform(profile, format, 0 as Parameters<typeof lcms.cmsCreateTransform>[2], format, lcms.CmsIntent.Percepttual, transformFlags).valueOrThrow
      const input = lutInputs(size)
      const transformed = lcms.cmsDoTransform(transform, adjustment.lookupType === 'abstractProfile' ? srgbToLab(input) : input, size ** 3).valueOrThrow
      const output = adjustment.lookupType === 'abstractProfile' ? labToSrgb(transformed) : transformed
      return output.length >= size ** 3 * 3 ? { ...adjustment, iccPreview: { size, data: [...output.slice(0, size ** 3 * 3)] } } : adjustment
    } finally {
      if (transform) lcms.cmsDeleteTransform(transform)
      lcms.cmsCloseProfile(profile)
    }
  } catch {
    return adjustment
  }
}
