import { describe, expect, it } from 'vitest';
import { main } from '../src/cli.ts';
import type { Command, CommandContext } from '../src/commands/context.ts';
import { TwinError } from '../src/errors.ts';
import { fakeHost, fakeIo, noBackend } from './helpers/fakes.ts';

function context(io: ReturnType<typeof fakeIo>['io']): CommandContext {
  return { io, host: fakeHost(), cwd: '/tmp', version: '1.2.3', getBackend: noBackend };
}

describe('main', () => {
  it('prints usage with exit 2 when no command is given', async () => {
    const { io, stdout } = fakeIo();
    expect(await main([], context(io))).toBe(2);
    expect(stdout.text).toContain('Usage: twin <command>');
    expect(stdout.text).toContain('capture');
    expect(stdout.text).toContain('inspect');
  });

  it.each(['--help', '-h', 'help'])('prints usage for %s', async (flag) => {
    const { io, stdout } = fakeIo();
    expect(await main([flag], context(io))).toBe(0);
    expect(stdout.text).toContain('Commands:');
  });

  it.each(['--version', '-v'])('prints the version for %s', async (flag) => {
    const { io, stdout } = fakeIo();
    expect(await main([flag], context(io))).toBe(0);
    expect(stdout.text).toBe('1.2.3\n');
  });

  it('rejects unknown commands', async () => {
    const { io, stderr } = fakeIo();
    expect(await main(['frobnicate'], context(io))).toBe(2);
    expect(stderr.text).toContain('unknown command "frobnicate"');
  });

  it('turns unknown options into a usage error', async () => {
    const { io, stderr } = fakeIo();
    expect(await main(['inspect', '--wat'], context(io))).toBe(2);
    expect(stderr.text).toContain("Unknown option '--wat'");
    expect(stderr.text).toContain('Usage: twin inspect');
  });
});

describe('error mapping', () => {
  const failing = (error: unknown): Command => ({
    name: 'boom',
    summary: 'fails',
    usage: 'Usage: twin boom',
    run: async () => {
      throw error;
    },
  });

  it('prints TwinError messages without a stack and uses their exit code', async () => {
    const { io, stderr } = fakeIo();
    const commands = [failing(new TwinError('nice message', { exitCode: 7 }))];
    expect(await main(['boom'], context(io), commands)).toBe(7);
    expect(stderr.text).toBe('twin: nice message\n');
  });

  it('prints the stack for unexpected errors', async () => {
    const { io, stderr } = fakeIo();
    expect(await main(['boom'], context(io), [failing(new Error('kaboom'))])).toBe(1);
    expect(stderr.text).toContain('twin: unexpected error\nError: kaboom');
  });
});
