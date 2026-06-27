// Face matching engine. Pure helpers here are unit-tested; the Human-backed
// descriptor extraction (browser-only, WebGL/WASM) is added in Task 3.

/** Cosine similarity in [0,1] (negative clamped to 0). 0 if shapes differ or empty. */
export function similarity(a: number[], b: number[]): number {
  if (!a?.length || !b?.length || a.length !== b.length) return 0
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  if (na === 0 || nb === 0) return 0
  const cos = dot / (Math.sqrt(na) * Math.sqrt(nb))
  return Math.max(0, cos)
}

/** True when the live descriptor matches the enrolled one at/above threshold. */
export function isMatch(live: number[], enrolled: number[], threshold: number): boolean {
  return similarity(live, enrolled) >= threshold
}
