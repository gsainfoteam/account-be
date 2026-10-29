import { ArgumentsHost, BadRequestException } from '@nestjs/common';

import { OauthTokenException } from '../exceptions/oauth.token.exception';
import { OauthTokenExceptionFilter } from './oauthToken.filter';

function run(error: BadRequestException, authorization?: string) {
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
    send(body: unknown) {
      sent.body = body;
      return reply;
    },
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ headers: { authorization } }),
      getResponse: () => reply,
    }),
  } as unknown as ArgumentsHost;

  new OauthTokenExceptionFilter().catch(error, host);

  return { headers, ...sent };
}

describe('OauthTokenExceptionFilter', () => {
  it('challenges a client that failed basic authentication with 401', () => {
    const result = run(
      new OauthTokenException('invalid_client'),
      'Basic Y2xpZW50Ondyb25n',
    );

    expect(result.status).toBe(401);
    expect(result.headers['WWW-Authenticate']).toBe('Basic realm="oauth"');
    expect(result.body).toEqual({ error: 'invalid_client' });
  });

  it('keeps 400 for a client that sent its credentials in the body', () => {
    const result = run(new OauthTokenException('invalid_client'));

    expect(result.status).toBe(400);
    expect(result.headers['WWW-Authenticate']).toBeUndefined();
  });

  it('marks every error response as not cacheable', () => {
    const result = run(new OauthTokenException('invalid_grant'));

    expect(result.status).toBe(400);
    expect(result.headers['Cache-Control']).toBe('no-store');
    expect(result.headers['Pragma']).toBe('no-cache');
  });

  it('answers a request the validation pipe rejected with invalid_request', () => {
    const result = run(
      new BadRequestException([
        'grant_type must be one of the following values',
      ]),
    );

    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: 'invalid_request' });
    expect(result.headers['Cache-Control']).toBe('no-store');
  });
});
