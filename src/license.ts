const SLUG = 'dose-chain-log'
const KEY = `sb_license:${SLUG}`
const VERDICT_KEY = `${KEY}:verdict`
export const checkoutUrl = `https://api.sociobot.in/api/v1/products/${SLUG}/checkout`

interface Verdict { valid: boolean; checkedAt: number }

export function captureLicenseFromUrl(): void {
  const url = new URL(location.href)
  const token = url.searchParams.get('license')
  if (!token) return
  localStorage.setItem(KEY, token)
  localStorage.removeItem(VERDICT_KEY)
  url.searchParams.delete('license')
  history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
}

export function storeLicense(token: string): void {
  localStorage.setItem(KEY, token.trim())
  localStorage.removeItem(VERDICT_KEY)
}

export function removeLicense(): void {
  localStorage.removeItem(KEY)
  localStorage.removeItem(VERDICT_KEY)
}

export function hasOptimisticUnlock(): boolean {
  const token = localStorage.getItem(KEY)
  if (!token) return false
  const cached = parseVerdict()
  return cached?.valid !== false
}

function parseVerdict(): Verdict | undefined {
  try { return JSON.parse(localStorage.getItem(VERDICT_KEY) ?? '') as Verdict } catch { return undefined }
}

export async function verifyLicense(force = false): Promise<{ valid: boolean; reason?: string; offline?: boolean }> {
  const token = localStorage.getItem(KEY)
  if (!token) return { valid: false, reason: 'missing' }
  const cached = parseVerdict()
  if (!force && cached && Date.now() - cached.checkedAt < 86_400_000) return { valid: cached.valid }
  try {
    const response = await fetch(`https://api.sociobot.in/api/v1/products/${SLUG}/verify?license=${encodeURIComponent(token)}`)
    if (!response.ok) throw new Error('Verification service unavailable')
    const result = await response.json() as { valid: boolean; reason: string }
    localStorage.setItem(VERDICT_KEY, JSON.stringify({ valid: result.valid, checkedAt: Date.now() }))
    return result
  } catch {
    return { valid: hasOptimisticUnlock(), offline: true }
  }
}
