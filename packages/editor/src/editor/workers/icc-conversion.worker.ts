/// <reference lib="webworker" />
import { convertIccImageData } from '../icc'
import type { DocumentColorSettings, IccProfileReference } from '../types'

type IccConversionRequest = {
  assets: Array<{ assetId: string; data: ArrayBuffer; width: number; height: number }>
  source?: IccProfileReference
  target: IccProfileReference
  intent: DocumentColorSettings['intent']
  blackPointCompensation: boolean
}

self.onmessage = async (event: MessageEvent<IccConversionRequest>) => {
  try {
    const results = await Promise.all(event.data.assets.map(async (asset) => {
      const before = new Uint8ClampedArray(asset.data)
      if (before.length !== asset.width * asset.height * 4) throw new Error(`ICC source dimensions do not match ${asset.assetId}.`)
      const converted = await convertIccImageData(new ImageData(before, asset.width, asset.height), event.data.source, event.data.target, event.data.intent, event.data.blackPointCompensation)
      return { assetId: asset.assetId, before: before.buffer, after: converted.data.buffer, width: asset.width, height: asset.height }
    }))
    const transfer = results.flatMap((result) => [result.before, result.after])
    self.postMessage({ results }, { transfer })
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'ICC conversion failed.' })
  }
}
