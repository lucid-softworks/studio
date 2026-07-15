export function rulerStep(scale: number) {
  const target = 72 / Math.max(scale, 0.0001)
  const power = 10 ** Math.floor(Math.log10(target))
  return [1, 2, 5, 10].map((value) => value * power).find((value) => value >= target) ?? power * 10
}

export function rulerValues(start: number, end: number, step: number) {
  const result: number[] = []
  for (let value = Math.floor(start / step) * step; value <= end; value += step) result.push(value)
  return result
}
