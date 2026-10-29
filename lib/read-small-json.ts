export async function readSmallJson(request: Request, limit = 4096): Promise<unknown> {
  if (!request.body) throw new Error('Missing body')
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > limit) { await reader.cancel(); throw new Error('Payload too large') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  return JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)))
}
