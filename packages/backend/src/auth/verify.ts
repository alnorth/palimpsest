export function verifyToken(authHeader: string | undefined, validToken: string): boolean {
  if (!authHeader) return false
  const [scheme, token] = authHeader.split(' ')
  return scheme === 'Bearer' && token === validToken
}
