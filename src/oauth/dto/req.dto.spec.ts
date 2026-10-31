import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { AuthorizationReqDto, AuthorizeErrorReqDto } from './req.dto';

function errorsFor(codeChallengeMethod: string) {
  return validate(
    plainToInstance(AuthorizationReqDto, {
      response_type: 'code',
      client_id: 'client-1',
      code_challenge: 'c'.repeat(43),
      code_challenge_method: codeChallengeMethod,
      redirect_uri: 'https://app.example/callback',
      scope: 'name',
    }),
  );
}

describe('AuthorizationReqDto', () => {
  it('accepts the S256 PKCE method', async () => {
    await expect(errorsFor('S256')).resolves.toHaveLength(0);
  });

  it('rejects the plain PKCE method, which OAuth 2.1 removes', async () => {
    const errors = await errorsFor('plain');
    expect(errors.map((error) => error.property)).toEqual([
      'codeChallengeMethod',
    ]);
  });
});

describe('AuthorizeErrorReqDto', () => {
  it('accepts server_error, which account-fe reports when it cannot look up consent for prompt=none', async () => {
    const errors = await validate(
      plainToInstance(AuthorizeErrorReqDto, {
        client_id: 'client-1',
        redirect_uri: 'https://app.example/callback',
        error: 'server_error',
      }),
    );
    expect(errors).toHaveLength(0);
  });
});
