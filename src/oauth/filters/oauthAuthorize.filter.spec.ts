import { ArgumentsHost, BadRequestException } from '@nestjs/common';

import { OauthAuthorizeException } from '../exceptions/oauth.authorize.exception';
import { OauthAuthorizeExceptionFilter } from './oauthAuthorize.filter';

async function run(error: BadRequestException, redirect: string | null) {
  const headers: Record<string, string> = {};
  const sent: { status?: number; body?: unknown } = {};
  const reply = {
    header(name: string, value: string) {
      headers[name] = value;
      return reply;
    },
    status(code: number) {
      sent.status = code;
      return reply;
    },
    send(body?: unknown) {
      sent.body = body;
      return reply;
    },
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({
        url: '/oauth/authorize?client_id=client-1&redirect_uri=https%3A%2F%2Fapp.example%2Fcb&state=s-1',
      }),
      getResponse: () => reply,
    }),
  } as unknown as ArgumentsHost;
  const oauthService = {
    authorizeErrorRedirect: jest.fn(() => Promise.resolve(redirect)),
  };

  await new OauthAuthorizeExceptionFilter(oauthService as never).catch(
    error,
    host,
  );

  return { headers, oauthService, ...sent };
}

describe('OauthAuthorizeExceptionFilter', () => {
  it('redirects the error with the query the browser sent', async () => {
    const result = await run(
      new OauthAuthorizeException('invalid_scope'),
      'https://app.example/cb?error=invalid_scope',
    );

    expect(result.status).toBe(302);
    expect(result.headers['Location']).toBe(
      'https://app.example/cb?error=invalid_scope',
    );
    expect(result.oauthService.authorizeErrorRedirect).toHaveBeenCalledWith({
      clientId: 'client-1',
      redirectUri: 'https://app.example/cb',
      state: 's-1',
      error: 'invalid_scope',
    });
  });

  it('reports a query that failed validation as invalid_request', async () => {
    const result = await run(
      new BadRequestException(['nonce must be a string']),
      'https://app.example/cb?error=invalid_request',
    );

    expect(result.oauthService.authorizeErrorRedirect).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'invalid_request' }),
    );
  });

  it('shows the error instead of redirecting when the redirect cannot be trusted', async () => {
    const result = await run(
      new OauthAuthorizeException('invalid_scope'),
      null,
    );

    expect(result.status).toBe(400);
    expect(result.headers['Location']).toBeUndefined();
    expect(result.body).toMatchObject({ error: 'invalid_request' });
  });
});
