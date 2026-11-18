import { parse } from 'parse5'

export function parseStaticHtml(source) {
  return parse(source, { sourceCodeLocationInfo: true })
}

export function htmlAttribute(node, name) {
  return node.attrs?.find(attribute => attribute.name === name)?.value
}

export function* inlineScripts(source, node = parseStaticHtml(source)) {
  const location = node.sourceCodeLocation
  if (node.tagName === 'script' && location?.startTag && htmlAttribute(node, 'src') === undefined) {
    const body = source
      .slice(location.startTag.endOffset, location.endTag?.startOffset ?? location.endOffset)
      .replace(/\r\n?/g, '\n')
    if (body.trim()) yield { body, nonce: htmlAttribute(node, 'nonce') }
  }

  for (const child of node.childNodes ?? []) yield* inlineScripts(source, child)
}
