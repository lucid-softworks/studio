export function iccLookupProfile(profileClass: 'link' | 'abst') {
  const ascii = (target: Uint8Array, offset: number, value: string) => target.set(new TextEncoder().encode(value), offset)
  const fixed = (view: DataView, offset: number, value: number) => view.setInt32(offset, Math.round(value * 65_536))
  const align = (value: number) => Math.ceil(value / 4) * 4
  const description = new Uint8Array(20)
  ascii(description, 0, 'desc')
  new DataView(description.buffer).setUint32(8, 8)
  ascii(description, 12, 'Studio\0')
  const copyright = new Uint8Array(20)
  ascii(copyright, 0, 'text')
  ascii(copyright, 8, 'MIT test\0')
  const whitePoint = new Uint8Array(20)
  ascii(whitePoint, 0, 'XYZ ')
  const whiteView = new DataView(whitePoint.buffer)
  fixed(whiteView, 8, 0.9642); fixed(whiteView, 12, 1); fixed(whiteView, 16, 0.8249)
  const lut = new Uint8Array(48 + 3 * 256 + 2 ** 3 * 3 + 3 * 256)
  const lutView = new DataView(lut.buffer)
  ascii(lut, 0, 'mft1')
  lut[8] = 3; lut[9] = 3; lut[10] = 2
  fixed(lutView, 12, 1); fixed(lutView, 28, 1); fixed(lutView, 44, 1)
  let cursor = 48
  for (let channel = 0; channel < 3; channel += 1) for (let value = 0; value < 256; value += 1) lut[cursor++] = value
  for (let red = 0; red < 2; red += 1) for (let green = 0; green < 2; green += 1) for (let blue = 0; blue < 2; blue += 1) {
    lut[cursor++] = profileClass === 'link' ? (1 - red) * 255 : red * 255
    lut[cursor++] = green * 255
    lut[cursor++] = blue * 255
  }
  for (let channel = 0; channel < 3; channel += 1) for (let value = 0; value < 256; value += 1) lut[cursor++] = value
  const tags = [{ signature: 'desc', data: description }, { signature: 'cprt', data: copyright }, { signature: 'wtpt', data: whitePoint }, { signature: 'A2B0', data: lut }]
  let dataOffset = 128 + 4 + tags.length * 12
  const offsets = tags.map(({ data }) => {
    const offset = dataOffset
    dataOffset += align(data.length)
    return offset
  })
  const profile = new Uint8Array(dataOffset)
  const view = new DataView(profile.buffer)
  view.setUint32(0, profile.length)
  ascii(profile, 4, 'lcms')
  view.setUint32(8, 0x02100000)
  ascii(profile, 12, profileClass)
  ascii(profile, 16, profileClass === 'link' ? 'RGB ' : 'Lab ')
  ascii(profile, 20, profileClass === 'link' ? 'RGB ' : 'Lab ')
  view.setUint16(24, 2026); view.setUint16(26, 7); view.setUint16(28, 15); view.setUint16(30, 12)
  ascii(profile, 36, 'acsp')
  ascii(profile, 40, 'APPL')
  fixed(view, 68, 0.9642); fixed(view, 72, 1); fixed(view, 76, 0.8249)
  ascii(profile, 80, 'stud')
  view.setUint32(128, tags.length)
  tags.forEach(({ signature, data }, index) => {
    const record = 132 + index * 12
    ascii(profile, record, signature)
    view.setUint32(record + 4, offsets[index])
    view.setUint32(record + 8, data.length)
    profile.set(data, offsets[index])
  })
  return profile
}
