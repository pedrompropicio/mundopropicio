// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import { execSync } from 'child_process';
import { resolveBuildCommit } from '../../scripts/build-commit';
import configFactory from '../../vite.config';
import type { ConfigEnv, Plugin, UserConfig } from 'vite';

vi.mock('child_process', () => ({ execSync: vi.fn() }));
const sha1 = 'abcdef01'.repeat(5);
const sha2 = '12345678'.repeat(5);
const sha256 = '0123456789abcdef'.repeat(4);
const unavailable = () => { throw new Error('private error must not be published'); };

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('issue347 commit resolution', () => {
  it('prefers git, trims peripheral whitespace and normalizes case', () => {
    expect(resolveBuildCommit(() => ` \n${sha1.toUpperCase()}\t`, { VITE_COMMIT_SHA: sha2 }))
      .toEqual({ commit: sha1, commitSource: 'git' });
  });
  it('explicitly accepts full SHA-256 IDs', () => {
    expect(resolveBuildCommit(() => sha256, {})).toEqual({ commit: sha256, commitSource: 'git' });
  });
  it.each([unavailable, () => 'HEAD', () => ''])('falls back from missing or invalid git in environment priority order', (git) => {
    expect(resolveBuildCommit(git, { VITE_COMMIT_SHA: sha1, COMMIT_REF: sha2, GIT_COMMIT: sha256 }))
      .toEqual({ commit: sha1, commitSource: 'VITE_COMMIT_SHA' });
    expect(resolveBuildCommit(git, { VITE_COMMIT_SHA: 'invalid', COMMIT_REF: ` ${sha2}\n`, GIT_COMMIT: sha256 }))
      .toEqual({ commit: sha2, commitSource: 'COMMIT_REF' });
    expect(resolveBuildCommit(git, { COMMIT_REF: 'main', GIT_COMMIT: sha256 }))
      .toEqual({ commit: sha256, commitSource: 'GIT_COMMIT' });
  });
  it.each(['abcdef0', 'a'.repeat(39), 'a'.repeat(41), 'a'.repeat(63), 'a'.repeat(65),
    'g'.repeat(40), `${sha1}\n${sha2}`, `${sha1.slice(0, 20)}\n${sha1.slice(20)}`, '1792776905956', 'private-token'])
  ('rejects malformed values from every source without publishing them: %s', (value) => {
    expect(resolveBuildCommit(() => value, { VITE_COMMIT_SHA: value, COMMIT_REF: value, GIT_COMMIT: value }))
      .toEqual({ commit: null, commitSource: 'unknown' });
  });
  it('returns unknown when all sources are absent', () => {
    expect(resolveBuildCommit(unavailable, {})).toEqual({ commit: null, commitSource: 'unknown' });
  });
});

describe('issue347 actual Vite version.json writer', () => {
  it.each([
    { git: sha1, env: 'private-token', commit: sha1, source: 'git' },
    { git: null, env: ` ${sha2}\n`, commit: sha2, source: 'COMMIT_REF' },
    { git: 'HEAD', env: 'private-token', commit: null, source: 'unknown' },
  ])('preserves version/buildId contract with source $source', async ({ git, env, commit, source }) => {
    vi.stubEnv('VITE_COMMIT_SHA', 'private-token');
    vi.stubEnv('COMMIT_REF', env);
    vi.stubEnv('GIT_COMMIT', 'private-token');
    vi.mocked(execSync).mockImplementation(() => {
      if (git === null) return unavailable();
      return Buffer.from(git);
    });
    const mkdir = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
    const write = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const config = await (configFactory as (env: ConfigEnv) => UserConfig)({ mode: 'production', command: 'build' });
    const plugin = (config.plugins as Plugin[]).find((item) => item?.name === 'build-version-json')!;
    expect(plugin.apply).toBe('build');
    expect(typeof plugin.closeBundle).toBe('function');
    await (plugin.closeBundle as () => void)();
    expect(mkdir).toHaveBeenCalledWith('dist', { recursive: true });
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toBe('dist/version.json');
    const json = JSON.parse(write.mock.calls[0][1] as string);
    expect(json).toEqual({ buildId: expect.any(String), builtAt: expect.any(String), commit, commitSource: source });
    expect(json.buildId).toBe(String(Date.parse(json.builtAt)));
    expect(config.define?.__BUILD_ID__).toBe(JSON.stringify(json.buildId));
    expect(JSON.stringify(json)).not.toContain('private');
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(execSync).toHaveBeenCalledWith('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] });
  });
});
