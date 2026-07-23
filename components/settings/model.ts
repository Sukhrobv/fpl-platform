export function validFplId(value: string) {
  return /^\d+$/.test(value) && Number(value) > 0;
}
