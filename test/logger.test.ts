import { Logger } from '../src/logger.js';

describe('Logger', () => {
  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
    trace: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      trace: vi.spyOn(console, 'trace').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Error object serialization', () => {
    it('should properly serialize Error objects with stack trace', () => {
      const logger = new Logger('test', 'debug');
      const error = new Error('Test error message');

      logger.error('Socket error:', error);

      const logCall = consoleSpy.error.mock.calls[0][0];
      expect(logCall).toContain('Socket error:');
      expect(logCall).toContain('Error: Test error message');
      expect(logCall).toContain('at '); // Stack trace should be present

      // Should not have duplicate error message
      const errorMessageCount = (
        logCall.match(/Error: Test error message/g) || []
      ).length;
      expect(errorMessageCount).toBe(1);
    });

    it('should handle Error objects with additional properties', () => {
      const logger = new Logger('test', 'debug');
      const customError = new Error('Custom error message') as Error & {
        code?: string;
        statusCode?: number;
      };
      customError.code = 'CUSTOM_CODE';
      customError.statusCode = 500;

      logger.error('Testing custom error:', customError);

      const logCall = consoleSpy.error.mock.calls[0][0];
      expect(logCall).toContain('Error: Custom error message');
      expect(logCall).toContain('at '); // Stack trace should be present
    });

    it('should handle nested Error objects within other objects', () => {
      const logger = new Logger('test', 'debug');
      const errorEvent = {
        error: new Error('WebSocket connection failed'),
        type: 'error',
        target: '[WebSocket object]',
      };

      logger.error('ErrorEvent:', errorEvent);

      const logCall = consoleSpy.error.mock.calls[0][0];
      expect(logCall).toContain('ErrorEvent:');
      expect(logCall).toContain('Error: WebSocket connection failed');
      expect(logCall).toContain('"type":"error"');
      expect(logCall).toContain('"target":"[WebSocket object]"');
    });

    it('should not serialize Error objects as empty objects', () => {
      const logger = new Logger('test', 'debug');
      const error = new Error('Should not be empty');

      logger.error('Error:', error);

      const logCall = consoleSpy.error.mock.calls[0][0];
      expect(logCall).not.toContain('{}');
      expect(logCall).toContain('Error: Should not be empty');
    });
  });

  describe('Other object serialization', () => {
    it('should handle objects that normally serialize to empty objects', () => {
      const logger = new Logger('test', 'debug');
      const emptySerializingObj = Object.create(null);
      Object.defineProperty(emptySerializingObj, 'hiddenProp', {
        value: 'hidden value',
        enumerable: false,
      });
      emptySerializingObj.visibleProp = 'visible value';

      logger.info('Object:', emptySerializingObj);

      const logCall = consoleSpy.log.mock.calls[0][0];
      expect(logCall).toContain('"visibleProp":"visible value"');
      expect(logCall).not.toContain('{}');
    });

    it('should handle regular objects normally', () => {
      const logger = new Logger('test', 'debug');
      const regularObj = { name: 'test', value: 42 };

      logger.info('Regular object:', regularObj);

      const logCall = consoleSpy.log.mock.calls[0][0];
      expect(logCall).toContain('{"name":"test","value":42}');
    });

    it('should handle null and undefined', () => {
      const logger = new Logger('test', 'debug');

      logger.info('Values:', null, undefined);

      const logCall = consoleSpy.log.mock.calls[0][0];
      expect(logCall).toContain('null undefined');
    });
  });

  describe('WebSocket error scenario', () => {
    it('should log WebSocket errors like console.log does', () => {
      const logger = new Logger('@tvlabs/wdio-channel', 'debug');
      const wsError = new Error('Unexpected server response: 403');

      // Simulate the WebSocket error logging
      logger.error('Socket error:', wsError);

      const logCall = consoleSpy.error.mock.calls[0][0];

      // Should contain timestamp
      expect(logCall).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
      // Should contain log level
      expect(logCall).toContain('ERROR');
      // Should contain logger name
      expect(logCall).toContain('@tvlabs/wdio-channel');
      // Should contain the message
      expect(logCall).toContain('Socket error:');
      // Should contain the full error with stack trace
      expect(logCall).toContain('Error: Unexpected server response: 403');
      expect(logCall).toContain('at ');
      // Should NOT be empty object
      expect(logCall).not.toContain('{}');
    });
  });

  describe('Log levels', () => {
    it('should respect log levels', () => {
      const logger = new Logger('test', 'warn');

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(consoleSpy.log).not.toHaveBeenCalled();
      expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    });

    it('should handle silent log level', () => {
      const logger = new Logger('test', 'silent');

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');
      logger.trace('trace message');

      expect(consoleSpy.log).not.toHaveBeenCalled();
      expect(consoleSpy.warn).not.toHaveBeenCalled();
      expect(consoleSpy.error).not.toHaveBeenCalled();
      expect(consoleSpy.trace).not.toHaveBeenCalled();
    });
  });

  describe('WDIO_LOG_LEVEL env fallback', () => {
    const originalEnv = process.env.WDIO_LOG_LEVEL;

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.WDIO_LOG_LEVEL;
      } else {
        process.env.WDIO_LOG_LEVEL = originalEnv;
      }
    });

    it('uses WDIO_LOG_LEVEL when no level is passed', () => {
      process.env.WDIO_LOG_LEVEL = 'debug';
      const logger = new Logger('test');

      logger.debug('debug message');

      expect(consoleSpy.log).toHaveBeenCalledTimes(1);
    });

    it('explicit level wins over WDIO_LOG_LEVEL', () => {
      process.env.WDIO_LOG_LEVEL = 'debug';
      const logger = new Logger('test', 'error');

      logger.debug('debug message');
      logger.info('info message');
      logger.error('error message');

      expect(consoleSpy.log).not.toHaveBeenCalled();
      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    });

    it('falls back to info when WDIO_LOG_LEVEL is invalid', () => {
      process.env.WDIO_LOG_LEVEL = 'bogus';
      const logger = new Logger('test');

      logger.debug('debug message');
      logger.info('info message');

      expect(consoleSpy.log).toHaveBeenCalledTimes(1);
    });
  });
});
