import ts from 'typescript'

export async function load(url, context, nextLoad) {
  if (!url.endsWith('.tsx')) return nextLoad(url, context)
  const { readFile } = await import('node:fs/promises')
  const source = await readFile(new URL(url), 'utf8')
  return { format: 'module', shortCircuit: true, source: ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
  }).outputText }
}
