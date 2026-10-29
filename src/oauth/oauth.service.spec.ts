import { CacheNotFoundException } from '@lib/redis';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Client, RefreshToken, User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { AuthContext } from 'src/auth/types/authContext.type';

import { AuthorizationReqDto } from './dto/req.dto';
import { OauthTokenException } from './exceptions/oauth.token.exception';
import { OauthService } from './oauth.service';
import { ScopeType } from './types/scope.type';

const SECRET = 'client-secret';
const VERIFIER = 'v'.repeat(43);
const CHALLENGE = crypto
  .createHash('sha256')
  .update(VERIFIER)
  .digest('base64url');

function client(overrides: Partial<Client> = {}): Client {
  return {
    uuid: 'client-1',
    secret: bcrypt.hashSync(SECRET, 4),
    name: 'client',
    picture: null,
    urls: ['https://app.example/callback?from=login'],
    createdAt: new Date(),
    updatedAt: new Date(),
    deleteRequestedAt: null,
    idTokenAllowed: true,
    tokenEndpointAuthMethod: 'none',
    scopes: ['name'],
    optionalScopes: [],
    ...overrides,
  };
}

function setup(registered: Client = client()) {
  const redis = new Map<string, unknown>();
  const redisService = {
    set: jest.fn(
      (key: string, value: unknown, { prefix }: { prefix: string }) => {
        redis.set(`${prefix}:${key}`, value);
        return Promise.resolve();
      },
    ),
    get: jest.fn((key: string, { prefix }: { prefix: string }) =>
      Promise.resolve(redis.get(`${prefix}:${key}`) ?? null),
    ),
    getOrThrow: jest.fn((key: string, { prefix }: { prefix: string }) =>
      redis.has(`${prefix}:${key}`)
        ? Promise.resolve(redis.get(`${prefix}:${key}`))
        : Promise.reject(new CacheNotFoundException(`${prefix}:${key}`)),
    ),
    del: jest.fn((key: string, { prefix }: { prefix: string }) => {
      redis.delete(`${prefix}:${key}`);
      return Promise.resolve();
    }),
  };
  const oauthRepository = {
    findConsent: jest.fn(() => Promise.resolve({ scopes: ['name'] })),
    createRefreshToken: jest.fn(() => Promise.resolve()),
    findRefreshTokenByToken: jest.fn(
      (): Promise<RefreshToken> =>
        Promise.reject(new OauthTokenException('invalid_grant')),
    ),
    deleteRefreshTokenByToken: jest.fn(() => Promise.resolve()),
    rotateRefreshToken: jest.fn<Promise<boolean>, [string, string, unknown?]>(
      () => Promise.resolve(true),
    ),
    deleteRefreshTokenFamily: jest.fn(() => Promise.resolve()),
  };
  const clientService = {
    getClientByUuid: jest.fn(() => Promise.resolve(registered)),
  };
  const userService = {
    findUserByUuid: jest.fn(() =>
      Promise.resolve({
        uuid: 'user-1',
        name: '홍길동',
        studentId: '20231234',
        isIdVerified: true,
        phoneNumber: '010-0000-0000',
        isPhoneNumberVerified: false,
      }),
    ),
  };
  const configService = {
    getOrThrow: jest.fn(() => 'https://api.account.example'),
  };
  const jwtService = { sign: jest.fn(() => 'id-token') };

  const service = new OauthService(
    oauthRepository as never,
    redisService as never,
    configService as never,
    clientService as never,
    userService as never,
    jwtService as never,
  );
  return { service, redis, oauthRepository, jwtService };
}

const user = { uuid: 'user-1' } as User;

function storedRefreshToken(
  overrides: Partial<RefreshToken> = {},
): RefreshToken {
  return {
    token: 'rt-1',
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    nonce: null,
    scopes: ['offline_access', 'name'],
    familyId: 'family-1',
    usedAt: null,
    authTime: null,
    amr: [],
    clientUuid: 'client-1',
    userUuid: 'user-1',
    ...overrides,
  };
}

const refreshRequest = {
  grantType: 'refresh_token',
  clientId: 'client-1',
  refreshToken: 'rt-1',
} as const;

function authorizeRequest(
  scope: ScopeType[] = ['name'],
  overrides: Partial<AuthorizationReqDto> = {},
): AuthorizationReqDto {
  return {
    responseType: 'code',
    clientId: 'client-1',
    codeChallenge: CHALLENGE,
    codeChallengeMethod: 'S256',
    redirectUri: 'https://app.example/callback?from=login',
    scope,
    state: 'a b&c',
    nonce: scope.includes('openid') ? 'n-1' : undefined,
    ...overrides,
  };
}

async function authorize(
  service: OauthService,
  scope: ScopeType[] = ['name'],
  auth?: AuthContext,
) {
  const url = new URL(
    await service.authorize(authorizeRequest(scope), user, auth),
  );
  return { url, code: url.searchParams.get('code')! };
}

function errorOf(promise: Promise<unknown>) {
  return promise.then(
    () => undefined,
    (error: { getResponse?: () => unknown }) => error.getResponse?.() ?? error,
  );
}

describe('OauthService', () => {
  describe('authorize', () => {
    it('keeps the query of the redirect URI and encodes the state', async () => {
      const { service } = setup();
      const { url } = await authorize(service);

      expect(url.searchParams.get('from')).toBe('login');
      expect(url.searchParams.get('state')).toBe('a b&c');
      expect(url.searchParams.get('iss')).toBe('https://api.account.example');
    });

    it('checks the redirect URI before anything that could be redirected', async () => {
      const { service, oauthRepository } = setup();

      await expect(
        errorOf(
          service.authorize(
            authorizeRequest(['student_id'], {
              redirectUri: 'https://evil.example/callback',
            }),
            user,
          ),
        ),
      ).resolves.toEqual({ error: 'invalid_request' });
      expect(oauthRepository.findConsent).not.toHaveBeenCalled();
    });

    it('denies a user who has not consented to the client', async () => {
      const { service, oauthRepository } = setup();
      oauthRepository.findConsent.mockImplementation(() =>
        Promise.reject(new OauthTokenException('invalid_grant')),
      );

      await expect(
        errorOf(service.authorize(authorizeRequest(), user)),
      ).resolves.toEqual({ error: 'access_denied' });
    });
  });

  describe('authorizeErrorRedirect', () => {
    it('reports the error to a registered redirect URI with state and iss', async () => {
      const { service } = setup();
      const url = new URL(
        (await service.authorizeErrorRedirect({
          clientId: 'client-1',
          redirectUri: 'https://app.example/callback?from=login',
          state: 'a b&c',
          error: 'access_denied',
          errorDescription: 'user_cancelled',
        }))!,
      );

      expect(Object.fromEntries(url.searchParams)).toEqual({
        from: 'login',
        error: 'access_denied',
        error_description: 'user_cancelled',
        iss: 'https://api.account.example',
        state: 'a b&c',
      });
    });

    it('refuses a redirect URI the client did not register', async () => {
      const { service } = setup();

      await expect(
        service.authorizeErrorRedirect({
          clientId: 'client-1',
          redirectUri: 'https://evil.example/callback',
          error: 'login_required',
        }),
      ).resolves.toBeNull();
    });
  });

  describe('logoutRedirect', () => {
    it('returns to a registered post-logout URI with state', async () => {
      const { service } = setup();

      await expect(
        service.logoutRedirect({
          clientId: 'client-1',
          postLogoutRedirectUri: 'https://app.example/callback?from=login',
          state: 'a b&c',
        }),
      ).resolves.toBe('https://app.example/callback?from=login&state=a+b%26c');
    });

    it('refuses a post-logout URI the client did not register', async () => {
      const { service } = setup();

      await expect(
        service.logoutRedirect({
          clientId: 'client-1',
          postLogoutRedirectUri: 'https://evil.example/callback',
        }),
      ).resolves.toBeNull();
    });
  });

  describe('PKCE', () => {
    it('rejects a verifier that does not hash to the challenge', async () => {
      const { service } = setup();
      const { code } = await authorize(service);

      await expect(
        errorOf(
          service.codeGrant({
            grantType: 'authorization_code',
            clientId: 'client-1',
            code,
            codeVerifier: 'w'.repeat(43),
          }),
        ),
      ).resolves.toEqual({ error: 'invalid_grant' });
    });
  });

  describe('openid', () => {
    it('issues codes for openid whatever idTokenAllowed says', async () => {
      const { service } = setup(client({ idTokenAllowed: false }));
      const { code } = await authorize(service, ['openid', 'name']);

      expect(code).toEqual(expect.any(String));
    });
  });

  describe('token endpoint client authentication', () => {
    it('lets a public client exchange a code with PKCE alone', async () => {
      const { service } = setup();
      const { code } = await authorize(service);

      await expect(
        service.codeGrant({
          grantType: 'authorization_code',
          clientId: 'client-1',
          code,
          codeVerifier: VERIFIER,
        }),
      ).resolves.toMatchObject({ tokenType: 'Bearer' });
    });

    it('requires the secret of a confidential client', async () => {
      const { service } = setup(
        client({ tokenEndpointAuthMethod: 'client_secret_post' }),
      );

      const missing = await authorize(service);
      await expect(
        errorOf(
          service.codeGrant({
            grantType: 'authorization_code',
            clientId: 'client-1',
            code: missing.code,
            codeVerifier: VERIFIER,
          }),
        ),
      ).resolves.toEqual({ error: 'invalid_client' });

      const wrong = await authorize(service);
      await expect(
        errorOf(
          service.codeGrant({
            grantType: 'authorization_code',
            clientId: 'client-1',
            clientSecret: 'nope',
            code: wrong.code,
            codeVerifier: VERIFIER,
          }),
        ),
      ).resolves.toEqual({ error: 'invalid_client' });

      const right = await authorize(service);
      await expect(
        service.codeGrant({
          grantType: 'authorization_code',
          clientId: 'client-1',
          clientSecret: SECRET,
          code: right.code,
          codeVerifier: VERIFIER,
        }),
      ).resolves.toMatchObject({ tokenType: 'Bearer' });
    });

    it('does not consume the code when client authentication fails', async () => {
      const { service, redis } = setup(
        client({ tokenEndpointAuthMethod: 'client_secret_basic' }),
      );
      const { code } = await authorize(service);

      await errorOf(
        service.codeGrant({
          grantType: 'authorization_code',
          clientId: 'client-1',
          code,
          codeVerifier: VERIFIER,
        }),
      );
      expect(redis.has(`code:${code}`)).toBe(true);
    });
  });

  describe('token endpoint errors', () => {
    it('answers a code issued to another client with invalid_grant', async () => {
      const { service } = setup();
      const { code } = await authorize(service);

      await expect(
        errorOf(
          service.codeGrant({
            grantType: 'authorization_code',
            clientId: 'client-2',
            code,
            codeVerifier: VERIFIER,
          }),
        ),
      ).resolves.toEqual({ error: 'invalid_grant' });
    });
  });

  describe('client credentials', () => {
    const grant = (clientSecret?: string) => ({
      grantType: 'client_credentials' as const,
      clientId: 'client-1',
      clientSecret: clientSecret as string,
      scope: ['name' as const],
    });

    it('keeps issuing to a client registered before the auth method existed', async () => {
      const { service } = setup();

      await expect(
        service.clientCredentialsGrant(grant(SECRET)),
      ).resolves.toMatchObject({ tokenType: 'Bearer' });
      await expect(
        errorOf(service.clientCredentialsGrant(grant('wrong'))),
      ).resolves.toEqual({ error: 'invalid_client' });
    });

    it('answers a missing secret with invalid_client instead of crashing', async () => {
      const { service } = setup(
        client({ tokenEndpointAuthMethod: 'client_secret_post' }),
      );

      await expect(
        errorOf(service.clientCredentialsGrant(grant())),
      ).resolves.toEqual({ error: 'invalid_client' });
    });

    it('issues a token to a confidential client with its secret', async () => {
      const { service } = setup(
        client({ tokenEndpointAuthMethod: 'client_secret_post' }),
      );

      await expect(
        service.clientCredentialsGrant(grant(SECRET)),
      ).resolves.toMatchObject({ tokenType: 'Bearer' });
    });
  });

  describe('refresh tokens', () => {
    it('stores the nonce of the authorization with the refresh token', async () => {
      const { service, oauthRepository } = setup();
      const { code } = await authorize(service, [
        'openid',
        'offline_access',
        'name',
      ]);

      await service.codeGrant({
        grantType: 'authorization_code',
        clientId: 'client-1',
        code,
        codeVerifier: VERIFIER,
      });
      expect(oauthRepository.createRefreshToken).toHaveBeenCalledWith(
        expect.objectContaining({
          scopes: ['openid', 'offline_access', 'name'],
          userUuid: 'user-1',
          clientUuid: 'client-1',
          nonce: 'n-1',
        }),
      );
    });
  });

  describe('id_token claims', () => {
    it('carries the verification flags with the student id and phone number, as userinfo does', async () => {
      const { service, oauthRepository, jwtService } = setup(
        client({ scopes: ['student_id', 'phone_number'] }),
      );
      oauthRepository.findConsent.mockImplementation(() =>
        Promise.resolve({ scopes: ['student_id', 'phone_number'] }),
      );
      const { code } = await authorize(service, [
        'openid',
        'student_id',
        'phone_number',
      ]);

      await service.codeGrant({
        grantType: 'authorization_code',
        clientId: 'client-1',
        code,
        codeVerifier: VERIFIER,
      });
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          student_id: '20231234',
          is_student_id_verified: true,
          phone_number: '010-0000-0000',
          is_phone_number_verified: false,
        }),
      );
    });
  });

  describe('auth_time and amr', () => {
    const auth = { authTime: 1_700_000_000, amr: ['hwk', 'user'] };

    it('puts how the user signed in to the IdP into the id_token and the refresh token', async () => {
      const { service, oauthRepository, jwtService } = setup();
      const { code } = await authorize(
        service,
        ['openid', 'offline_access', 'name'],
        auth,
      );

      await service.codeGrant({
        grantType: 'authorization_code',
        clientId: 'client-1',
        code,
        codeVerifier: VERIFIER,
      });
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ auth_time: 1_700_000_000, amr: auth.amr }),
      );
      expect(oauthRepository.createRefreshToken).toHaveBeenCalledWith(
        expect.objectContaining(auth),
      );
    });

    it('keeps them when the refresh token grant issues a new id_token', async () => {
      const { service, oauthRepository, jwtService } = setup();
      oauthRepository.findRefreshTokenByToken.mockImplementation(() =>
        Promise.resolve(
          storedRefreshToken({
            scopes: ['openid', 'offline_access'],
            authTime: new Date(1_700_000_000_000),
            amr: ['pwd'],
          }),
        ),
      );

      await service.refreshTokenGrant(refreshRequest);
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ auth_time: 1_700_000_000, amr: ['pwd'] }),
      );
      expect(oauthRepository.rotateRefreshToken).toHaveBeenCalledWith(
        'rt-1',
        'family-1',
        expect.objectContaining({ authTime: 1_700_000_000, amr: ['pwd'] }),
      );
    });

    it('omits them for a session from before they were recorded', async () => {
      const { service, oauthRepository, jwtService } = setup();
      oauthRepository.findRefreshTokenByToken.mockImplementation(() =>
        Promise.resolve(storedRefreshToken({ scopes: ['openid'] })),
      );

      await service.refreshTokenGrant(refreshRequest);
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ auth_time: undefined, amr: undefined }),
      );
    });
  });

  describe('refreshing an openid session', () => {
    it('issues an id_token without a nonce for a refresh token stored before nonces were kept', async () => {
      const { service, oauthRepository, jwtService } = setup();
      oauthRepository.findRefreshTokenByToken.mockImplementation(() =>
        Promise.resolve(
          storedRefreshToken({ scopes: ['openid', 'offline_access', 'name'] }),
        ),
      );

      await expect(
        service.refreshTokenGrant({
          grantType: 'refresh_token',
          clientId: 'client-1',
          refreshToken: 'rt-1',
        }),
      ).resolves.toMatchObject({ idToken: 'id-token' });
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 'user-1', nonce: undefined }),
      );
    });
  });

  describe('revoke', () => {
    it('revokes an access token only for the client it was issued to', async () => {
      const { service, redis } = setup();
      redis.set('token:mine', {
        to: 'user',
        sub: 'user-1',
        clientId: 'client-1',
        scope: [],
      });
      redis.set('token:theirs', {
        to: 'user',
        sub: 'user-2',
        clientId: 'client-2',
        scope: [],
      });

      await service.revoke({ token: 'mine', clientId: 'client-1' });
      await service.revoke({ token: 'theirs', clientId: 'client-1' });

      expect(redis.has('token:mine')).toBe(false);
      expect(redis.has('token:theirs')).toBe(true);
    });
  });

  describe('refresh token rotation', () => {
    it('rotates the token and continues its family', async () => {
      const { service, oauthRepository } = setup();
      oauthRepository.findRefreshTokenByToken.mockImplementation(() =>
        Promise.resolve(storedRefreshToken()),
      );

      const { refreshToken } = await service.refreshTokenGrant(refreshRequest);
      expect(typeof refreshToken).toBe('string');

      expect(oauthRepository.rotateRefreshToken).toHaveBeenCalledWith(
        'rt-1',
        'family-1',
        expect.objectContaining({
          token: refreshToken,
          scopes: ['offline_access', 'name'],
          userUuid: 'user-1',
          clientUuid: 'client-1',
          nonce: null,
          familyId: 'family-1',
          authTime: undefined,
          amr: undefined,
        }),
      );
      expect(oauthRepository.deleteRefreshTokenByToken).not.toHaveBeenCalled();
    });

    it('issues nothing when the token was already used', async () => {
      const { service, oauthRepository, redis } = setup();
      oauthRepository.findRefreshTokenByToken.mockImplementation(() =>
        Promise.resolve(storedRefreshToken({ usedAt: new Date() })),
      );
      oauthRepository.rotateRefreshToken.mockImplementation(() =>
        Promise.resolve(false),
      );

      await expect(
        errorOf(service.refreshTokenGrant(refreshRequest)),
      ).resolves.toEqual({ error: 'invalid_grant' });
      expect(redis.size).toBe(0);
    });

    it('revokes the whole family when a refresh token is revoked', async () => {
      const { service, oauthRepository } = setup();
      oauthRepository.findRefreshTokenByToken.mockImplementation(() =>
        Promise.resolve(storedRefreshToken()),
      );

      await service.revoke({
        token: 'rt-1',
        tokenTypeHint: 'refresh_token',
        clientId: 'client-1',
      });

      expect(oauthRepository.deleteRefreshTokenFamily).toHaveBeenCalledWith(
        'family-1',
      );
    });
  });

  describe('revokeDeprecated', () => {
    it('keeps revoking by token type hint without client authentication', async () => {
      const { service, redis } = setup();
      redis.set('token:any', {
        to: 'user',
        sub: 'user-1',
        clientId: 'client-2',
        scope: [],
      });

      await service.revokeDeprecated({
        token: 'any',
        tokenTypeHint: 'access_token',
      });

      expect(redis.has('token:any')).toBe(false);
    });

    it('still requires a token type hint', async () => {
      const { service } = setup();
      await expect(
        service.revokeDeprecated({ token: 'any' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('userinfo', () => {
    it('answers an unknown token with 401', async () => {
      const { service } = setup();
      await expect(service.userinfo('unknown')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });
});
