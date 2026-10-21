import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';

import { OauthAuthorizeException } from '../exceptions/oauth.authorize.exception';
import { OauthService } from '../oauth.service';

/**
 * shape authorize endpoint errors as RFC 6749 section 4.1.2.1 requires.
 * the browser navigates to this endpoint, so an error is sent back to the client's redirect_uri with
 * error, state and iss (RFC 9207). when client_id or redirect_uri cannot be trusted, the error is shown
 * to the user instead, because redirecting there would hand the request to an unknown party.
 * errors raised while validating the query are handled here as well, as invalid_request.
 */
@Catch(BadRequestException)
export class OauthAuthorizeExceptionFilter implements ExceptionFilter {
  constructor(private readonly oauthService: OauthService) {}

  async catch(
    exception: BadRequestException,
    host: ArgumentsHost,
  ): Promise<void> {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();

    const query = new URL(request.url, 'http://localhost').searchParams;
    const redirect = await this.oauthService.authorizeErrorRedirect({
      clientId: query.get('client_id'),
      redirectUri: query.get('redirect_uri'),
      state: query.get('state'),
      error:
        exception instanceof OauthAuthorizeException
          ? exception.error
          : 'invalid_request',
    });

    if (!redirect) {
      void reply.status(400).send(UNTRUSTED_REDIRECT);
      return;
    }

    void reply.status(302).header('Location', redirect).send();
  }
}

export const UNTRUSTED_REDIRECT = {
  error: 'invalid_request',
  error_description: 'unknown client_id or unregistered redirect_uri',
};
