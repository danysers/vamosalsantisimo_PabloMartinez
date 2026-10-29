// Bound bytes actually received, including chunked responses with no length.
export async function boundedDownload(response, maximum) {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Empty download')
  const chunks = []
  let bytes = 0
  try {
    if (Number(response.headers.get('content-length')) > maximum) throw new Error('Download exceeds size limit')
    while (true) {
      const result = await reader.read()
      if (result.done) break
      bytes += result.value.byteLength
      if (bytes > maximum) throw new Error('Download exceeds size limit')
      chunks.push(result.value)
    }
    return Buffer.concat(chunks, bytes)
  } catch (error) {
    await reader.cancel().catch(() => {})
    throw error
  } finally { reader.releaseLock() }
}
