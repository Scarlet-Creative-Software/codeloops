import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Temperature Configuration', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Spy on console.warn
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    // Clear module cache to force re-evaluation of config
    vi.resetModules();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    
    // Restore console.warn
    consoleWarnSpy.mockRestore();
  });

  it('should use default values when environment variables are not set', async () => {
    delete process.env.CRITIC_TEMP_CORRECTNESS;
    delete process.env.CRITIC_TEMP_EFFICIENCY;
    delete process.env.CRITIC_TEMP_SECURITY;
    delete process.env.CRITIC_TEMP_DEFAULT;

    const { CRITIC_TEMPERATURES } = await import('./config.js');

    expect(CRITIC_TEMPERATURES.correctness).toBe(0.3);
    expect(CRITIC_TEMPERATURES.efficiency).toBe(0.4);
    expect(CRITIC_TEMPERATURES.security).toBe(0.3);
    expect(CRITIC_TEMPERATURES.default).toBe(0.3);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('should use environment variable values when set', async () => {
    process.env.CRITIC_TEMP_CORRECTNESS = '0.5';
    process.env.CRITIC_TEMP_EFFICIENCY = '0.6';
    process.env.CRITIC_TEMP_SECURITY = '0.4';
    process.env.CRITIC_TEMP_DEFAULT = '0.7';

    const { CRITIC_TEMPERATURES } = await import('./config.js');

    expect(CRITIC_TEMPERATURES.correctness).toBe(0.5);
    expect(CRITIC_TEMPERATURES.efficiency).toBe(0.6);
    expect(CRITIC_TEMPERATURES.security).toBe(0.4);
    expect(CRITIC_TEMPERATURES.default).toBe(0.7);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('should clamp values above 1.0', async () => {
    process.env.CRITIC_TEMP_CORRECTNESS = '1.5';
    process.env.CRITIC_TEMP_EFFICIENCY = '2.0';

    const { CRITIC_TEMPERATURES } = await import('./config.js');

    expect(CRITIC_TEMPERATURES.correctness).toBe(1.0);
    expect(CRITIC_TEMPERATURES.efficiency).toBe(1.0);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Temperature CRITIC_TEMP_CORRECTNESS=1.5 is out of range')
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Temperature CRITIC_TEMP_EFFICIENCY=2 is out of range')
    );
  });

  it('should clamp values below 0.0', async () => {
    process.env.CRITIC_TEMP_SECURITY = '-0.5';
    process.env.CRITIC_TEMP_DEFAULT = '-1.0';

    const { CRITIC_TEMPERATURES } = await import('./config.js');

    expect(CRITIC_TEMPERATURES.security).toBe(0.0);
    expect(CRITIC_TEMPERATURES.default).toBe(0.0);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Temperature CRITIC_TEMP_SECURITY=-0.5 is out of range')
    );
  });

  it('should handle invalid values', async () => {
    process.env.CRITIC_TEMP_CORRECTNESS = 'not-a-number';
    process.env.CRITIC_TEMP_EFFICIENCY = '';

    const { CRITIC_TEMPERATURES } = await import('./config.js');

    expect(CRITIC_TEMPERATURES.correctness).toBe(0.3);
    expect(CRITIC_TEMPERATURES.efficiency).toBe(0.3);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid temperature value for CRITIC_TEMP_CORRECTNESS')
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid temperature value for CRITIC_TEMP_EFFICIENCY')
    );
  });

  it('should handle edge cases correctly', async () => {
    process.env.CRITIC_TEMP_CORRECTNESS = '0.0';
    process.env.CRITIC_TEMP_EFFICIENCY = '1.0';

    const { CRITIC_TEMPERATURES } = await import('./config.js');

    expect(CRITIC_TEMPERATURES.correctness).toBe(0.0);
    expect(CRITIC_TEMPERATURES.efficiency).toBe(1.0);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });
});