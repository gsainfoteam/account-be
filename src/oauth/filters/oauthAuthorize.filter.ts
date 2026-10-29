import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FastifyReply, FastifyRequest } from 'fastify';
import { ClientService } from 'src/client/client.service';

import { OauthAuthorizeException } from '../exceptions/oauth.authorize.exception';

/**
 * shape authorize endpoint errors as RFC 6749 section 4.1.2.1 requires.
 * the browser navigates to this endpoint, so an error is sent back to the client's redirect_uri with
 * error, state and iss (RFC 9207). when client_id or redirect_uri cannot be trusted, the error is shown
 * to the user instead, because redirecting there would hand the request to an unknown party.
 * errors raised while validating the query are handled here as well, as invalid_request.
 */
@Catch(BadRequestException)
export class OauthAuthorizeExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly clientService: ClientService,
    private readonly configService: ConfigService,
  ) {}

  async catch(
    exception: BadRequestException,
    host: ArgumentsHost,
  ): Promise<void> {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();

    const query = new URL(request.url, 'http://localhost').searchParams;
    const error =
      exception instanceof OauthAuthorizeException
        ? exception.error
        : 'invalid_request';
    const redirectUri = await this.trustedRedirectUri(
      query.get('client_id'),
      query.get('redirect_uri'),
    );

    if (!redirectUri) {
      void reply.status(400).send({
        error: 'invalid_request',
        error_description: 'unknown client_id or unregistered redirect_uri',
      });
      return;
    }

    const url = new URL(redirectUri);
    url.searchParams.set('error', error);
    url.searchParams.set(
      'iss',
      this.configService.getOrThrow<string>('JWT_ISSUER'),
    );
    const state = query.get('state');
    if (state) url.searchParams.set('state', state);

    void reply.status(302).header('Location', url.toString()).send();
  }

  private async trustedRedirectUri(
    clientId: string | null,
    redirectUri: string | null,
  ): Promise<string | null> {
    if (!clientId || !redirectUri) return null;

    const client = await this.clientService
      .getClientByUuid(clientId)
      .catch(() => null);

    return client?.urls.includes(redirectUri) ? redirectUri : null;
  }
}
