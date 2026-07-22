export function numericInputValue(input: HTMLInputElement, fallback: number) {
  return Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : fallback
}
