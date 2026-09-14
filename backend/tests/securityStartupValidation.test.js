const { validateAppSecurity } = require('../utils/config');

describe('Security Startup Validation Test', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('should allow development mode startup with default dev secret', () => {
    delete process.env.JWT_SECRET;
    delete process.env.ENCRYPTION_KEY;
    process.env.APP_MODE = 'development';
    process.env.NODE_ENV = 'development';

    expect(() => validateAppSecurity('development')).not.toThrow();
  });

  test('should refuse server boot in production mode if JWT_SECRET is weak or default', () => {
    const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('PROCESS_EXIT_1');
    });
    const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    process.env.JWT_SECRET = 'change_this_in_production_weak_secret';
    process.env.APP_MODE = 'production';
    process.env.NODE_ENV = 'production';

    expect(() => validateAppSecurity('production')).toThrow('PROCESS_EXIT_1');
    expect(mockConsoleError).toHaveBeenCalled();

    mockExit.mockRestore();
    mockConsoleError.mockRestore();
  });
});
