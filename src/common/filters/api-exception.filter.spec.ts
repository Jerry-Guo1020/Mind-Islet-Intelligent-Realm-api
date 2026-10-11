import { BadRequestException } from '@nestjs/common';
import { ApiExceptionFilter } from './api-exception.filter';

describe('ApiExceptionFilter', () => {
  function capture(exception: unknown) {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    };
    new ApiExceptionFilter().catch(exception, host as never);
    const statusCalls = status.mock.calls as unknown[][];
    const jsonCalls = json.mock.calls as unknown[][];
    return {
      status: statusCalls[0][0],
      body: jsonCalls[0][0],
    };
  }

  it('wraps an HTTP exception as code, data, msg', () => {
    expect(capture(new BadRequestException('code is required'))).toEqual({
      status: 400,
      body: { code: 400, data: null, msg: 'code is required' },
    });
  });

  it('hides unexpected errors behind a generic message', () => {
    expect(capture(new Error('database password leaked'))).toEqual({
      status: 500,
      body: { code: 500, data: null, msg: 'Internal server error' },
    });
  });
});
