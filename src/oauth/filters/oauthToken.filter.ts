import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';

import { OauthTokenException } from '../exceptions/oauth.token.exception';

/**
 * shape token endpoint errors as RFC 6749 section 5.2 requires.
 * invalid_client is answered with 401 and a WWW-Authenticate challenge when the client tried basic auth,
 * and no error response may be cached.
 * a request the validation pipe rejected is invalid_request, since clients branch on the error code.
 */
@Catch(BadRequestException)
export class OauthTokenExceptionFilter implements ExceptionFilter {
  catch(exception: BadRequestException, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();

    const body =
      exception instanceof OauthTokenException
        ? (exception.getResponse() as { error: string })
        : { error: 'invalid_request' };
    const triedBasicAuth =
      request.headers.authorization?.startsWith('Basic ') ?? false;
    const challenge = body.error === 'invalid_client' && triedBasicAuth;

    reply.header('Cache-Control', 'no-store').header('Pragma', 'no-cache');
    if (challenge) reply.header('WWW-Authenticate', 'Basic realm="oauth"');

    void reply.status(challenge ? 401 : 400).send(body);
  }
}
