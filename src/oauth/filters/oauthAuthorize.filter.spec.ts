import { ArgumentsHost, BadRequestException } from '@nestjs/common';

import { OauthAuthorizeException } from '../exceptions/oauth.authorize.exception';
import { OauthAuthorizeExceptionFilter } from './oauthAuthorize.filter';

const REDIRECT_URI = 'https://app.example/callback?from=login';

async function run(error: BadRequestException, query: Record<string, string>) {
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
        url: `/oauth/authorize?${new URLSearchParams(query).toString()}`,
      }),
      getResponse: () => reply,
    }),
  } as unknown as ArgumentsHost;
  const clientService = {
    getClientByUuid: jest.fn((uuid: string) =>
      uuid === 'client-1'
        ? Promise.resolve({ urls: [REDIRECT_URI] })
        : Promise.reject(new Error('not found')),
    ),
  };
  const configService = {
    getOrThrow: jest.fn(() => 'https://api.account.example'),
  };

  await new OauthAuthorizeExceptionFilter(
    clientService as never,
    configService as never,
  ).catch(error, host);

  const location = headers['Location'] ? new URL(headers['Location']) : null;
  return { location, ...sent };
}

describe('OauthAuthorizeExceptionFilter', () => {
  it('sends the error back to a registered redirect URI with state and iss', async () => {
    const result = await run(new OauthAuthorizeException('invalid_scope'), {
      client_id: 'client-1',
      redirect_uri: REDIRECT_URI,
      state: 'a b&c',
    });

    expect(result.status).toBe(302);
    expect(result.location?.origin + result.location!.pathname).toBe(
      'https://app.example/callback',
    );
    expect(Object.fromEntries(result.location!.searchParams)).toEqual({
      from: 'login',
      error: 'invalid_scope',
      state: 'a b&c',
      iss: 'https://api.account.example',
    });
  });

  it('reports a query that failed validation as invalid_request', async () => {
    const result = await run(
      new BadRequestException(['nonce must be a string']),
      {
        client_id: 'client-1',
        redirect_uri: REDIRECT_URI,
      },
    );

    expect(result.location?.searchParams.get('error')).toBe('invalid_request');
  });

  it('never redirects to a URI the client did not register', async () => {
    const result = await run(new OauthAuthorizeException('invalid_scope'), {
      client_id: 'client-1',
      redirect_uri: 'https://evil.example/callback',
    });

    expect(result.status).toBe(400);
    expect(result.location).toBeNull();
    expect(result.body).toMatchObject({ error: 'invalid_request' });
  });

  it('never redirects for an unknown client', async () => {
    const result = await run(new OauthAuthorizeException('invalid_scope'), {
      client_id: 'someone',
      redirect_uri: REDIRECT_URI,
    });

    expect(result.status).toBe(400);
    expect(result.location).toBeNull();
  });
});
