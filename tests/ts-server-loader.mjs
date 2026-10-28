// Test-only loader for Node's type stripping. Production keeps the server-only
// sentinel and lets Next resolve extensionless TypeScript imports normally.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'server-only') return { url: 'data:text/javascript,export {}', shortCircuit: true }
  if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
    try { return await nextResolve(`${specifier}.ts`, context) } catch { /* Fall through. */ }
  }
  return nextResolve(specifier, context)
}
