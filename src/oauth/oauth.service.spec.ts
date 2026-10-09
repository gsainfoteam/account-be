import { CacheNotFoundException } from '@lib/redis';
import { UnauthorizedException } from '@nestjs/common';
import { Client, User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

import { OauthTokenException } from './exceptions/oauth.token.exception';
import { OauthService } from './oauth.service';

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
      async (key: string, value: unknown, { prefix }: { prefix: string }) => {
        redis.set(`${prefix}:${key}`, value);
      },
    ),
    get: jest.fn(
      async (key: string, { prefix }: { prefix: string }) =>
        redis.get(`${prefix}:${key}`) ?? null,
    ),
    getOrThrow: jest.fn(async (key: string, { prefix }: { prefix: string }) => {
      if (!redis.has(`${prefix}:${key}`))
        throw new CacheNotFoundException(`${prefix}:${key}`);
      return redis.get(`${prefix}:${key}`);
    }),
    del: jest.fn(async (key: string, { prefix }: { prefix: string }) => {
      redis.delete(`${prefix}:${key}`);
    }),
  };
  const oauthRepository = {
    findConsent: jest.fn(async () => ({ scopes: ['name'] })),
    createRefreshToken: jest.fn(async () => undefined),
    findRefreshTokenByToken: jest.fn(async () => {
      throw new OauthTokenException('invalid_grant');
    }),
    deleteRefreshTokenByToken: jest.fn(async () => undefined),
  };
  const clientService = { getClientByUuid: jest.fn(async () => registered) };
  const userService = {
    findUserByUuid: jest.fn(async () => ({ uuid: 'user-1', name: '홍길동' })),
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
  return { service, redis, oauthRepository };
}

const user = { uuid: 'user-1' } as User;

async function authorize(service: OauthService, scope = ['name']) {
  const url = new URL(
    await service.authorize(
      {
        responseType: 'code',
        clientId: 'client-1',
        codeChallenge: CHALLENGE,
        codeChallengeMethod: 'S256',
        redirectUri: 'https://app.example/callback?from=login',
        scope: scope as never,
        state: 'a b&c',
        nonce: scope.includes('openid') ? 'n-1' : undefined,
      },
      user,
    ),
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
        expect.any(String),
        ['openid', 'offline_access', 'name'],
        'user-1',
        'client-1',
        'n-1',
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

  describe('userinfo', () => {
    it('answers an unknown token with 401', async () => {
      const { service } = setup();
      await expect(service.userinfo('unknown')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });
});
