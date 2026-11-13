type Candidate = { id: string; username: string | null; banned: boolean | null; disabled: boolean; role: string; auth_role: string }

export function selectExistingAdministrator(rows: Candidate[], expectedUsername: string, allowSingle: boolean) {
  const named = rows.filter(row => row.username === expectedUsername)
  const eligible = (row: Candidate) => !row.banned && !row.disabled && row.role === 'configuration' && row.auth_role === 'admin'
  if (named.length) {
    if (named.length !== 1 || !eligible(named[0])) throw new Error('Existing administrator must be verified')
    return named[0].id
  }
  const candidates = rows.filter(eligible)
  // Explicit migration opt-in; no matching by an unverified email or an IdP username.
  if (!allowSingle || candidates.length !== 1) throw new Error('Existing administrator must be verified')
  return candidates[0].id
}
