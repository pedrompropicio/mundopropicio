import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function verifyVersion(version, expectedCommit) {
  if (!/^[a-f0-9]{40}$/i.test(expectedCommit)) throw new Error('SHA esperado inválido (usar os 40 caracteres).');
  if (!version || typeof version.buildId !== 'string' || !version.buildId ||
      typeof version.builtAt !== 'string' || !Number.isFinite(Date.parse(version.builtAt))) {
    throw new Error('version.json inválido: faltam buildId/builtAt.');
  }
  if (version.commit !== expectedCommit) {
    throw new Error(`Produção diferente: esperado ${expectedCommit}, servido ${version.commit ?? 'sem SHA'}.`);
  }
  return version;
}

export async function checkDeploy(origin, expectedCommit) {
  const url = new URL('/version.json', origin);
  url.searchParams.set('check', String(Date.now()));
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`version.json: HTTP ${response.status}.`);
  return verifyVersion(await response.json(), expectedCommit);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const expected = process.argv[3] || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const version = await checkDeploy(process.argv[2] || 'https://mpgestaoeventos.com', expected);
    console.log(JSON.stringify({ status: 'ok', ...version }, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}