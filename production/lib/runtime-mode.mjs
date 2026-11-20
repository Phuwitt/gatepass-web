/** Deployment mode is independent of device actuation readiness.
 * @param {Record<string,string|undefined>} [env]
 * @returns {'production'|'preview'|'local'}
 */
export function workspaceMode(env = process.env) {
  if (env.VERCEL_ENV === 'production') return 'production';
  if (env.VERCEL_ENV === 'preview' || env.GATEPASS_PREVIEW === '1') return 'preview';
  return 'local';
}
