import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const body =
      exception instanceof HttpException ? exception.getResponse() : null;
    const msg = this.readMessage(body);

    response.status(status).json({ code: status, data: null, msg });
  }

  private readMessage(body: unknown): string {
    if (typeof body === 'string' && body.trim()) {
      return body;
    }
    if (body && typeof body === 'object' && 'message' in body) {
      const message = body.message;
      if (Array.isArray(message)) {
        return message.map(String).join('; ');
      }
      if (typeof message === 'string' && message.trim()) {
        return message;
      }
    }
    return 'Internal server error';
  }
}
