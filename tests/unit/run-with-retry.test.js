const { runCommandWithRetry } = require('../../scripts/run-with-retry');

describe('runCommandWithRetry', () => {
  test('retries a failed command until it succeeds', async () => {
    const runCommand = jest.fn()
      .mockRejectedValueOnce(new Error('temporary 502'))
      .mockResolvedValueOnce({ code: 0 });
    const sleep = jest.fn().mockResolvedValue(undefined);

    await runCommandWithRetry({
      command: ['npm', 'run', 'build:win'],
      attempts: 2,
      delayMs: 1500,
      runCommand,
      sleep
    });

    expect(runCommand).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(1500);
  });

  test('throws the final error after exhausting all retries', async () => {
    const failure = new Error('still failing');
    const runCommand = jest.fn().mockRejectedValue(failure);
    const sleep = jest.fn().mockResolvedValue(undefined);

    await expect(runCommandWithRetry({
      command: ['npm', 'run', 'build:linux'],
      attempts: 3,
      delayMs: 2000,
      runCommand,
      sleep
    })).rejects.toThrow('still failing');

    expect(runCommand).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});
