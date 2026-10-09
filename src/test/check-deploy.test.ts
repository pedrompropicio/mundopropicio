import { describe, expect, it } from 'vitest';
import { verifyVersion } from '../../scripts/check-deploy.mjs';

const sha = 'a'.repeat(40);
const version = { buildId: '1791584703336', builtAt: '2026-10-09T22:25:03.336Z', commit: sha };

describe('#231 prova de publicação', () => {
  it('aceita apenas o SHA solicitado com marca temporal', () => {
    expect(verifyVersion(version, sha)).toEqual(version);
  });
  it('recusa publicação antiga ou SHA ausente', () => {
    expect(() => verifyVersion({ ...version, commit: 'b'.repeat(40) }, sha)).toThrow('Produção diferente');
    expect(() => verifyVersion({ ...version, commit: null }, sha)).toThrow('Produção diferente');
  });
  it('recusa resposta incompleta e data inválida', () => {
    expect(() => verifyVersion({}, sha)).toThrow('version.json inválido');
    expect(() => verifyVersion({ ...version, builtAt: 'inválido' }, sha)).toThrow('version.json inválido');
  });
});