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
    const results: Array<{ assetId: string; before: ArrayBuffer; after: ArrayBuffer; width: number; height: number }> = []
    const transfer: ArrayBuffer[] = []
    for (const asset of event.data.assets) {
      const before = new Uint8ClampedArray(asset.data)
      if (before.length !== asset.width * asset.height * 4) throw new Error(`ICC source dimensions do not match ${asset.assetId}.`)
      const converted = await convertIccImageData(new ImageData(before, asset.width, asset.height), event.data.source, event.data.target, event.data.intent, event.data.blackPointCompensation)
      results.push({ assetId: asset.assetId, before: before.buffer, after: converted.data.buffer, width: asset.width, height: asset.height })
      transfer.push(before.buffer, converted.data.buffer)
    }
    self.postMessage({ results }, { transfer })
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'ICC conversion failed.' })
  }
}
