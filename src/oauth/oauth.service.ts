import { Trace } from '@gsainfoteam/nest-observability';
import { Loggable } from '@lib/logger';
import { CacheNotFoundException, RedisService } from '@lib/redis';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Client, RefreshToken, User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { isUUID } from 'class-validator';
import * as crypto from 'crypto';
import { AuthContext } from 'src/auth/types/authContext.type';
import { ClientService } from 'src/client/client.service';
import { UserService } from 'src/user/user.service';

import {
  AuthorizationReqDto,
  ConsentReqDto,
  RevokeReqDto,
} from './dto/req.dto';
import { TokenResDto, UserInfoResDto } from './dto/res.dto';
import { OauthAuthorizeException } from './exceptions/oauth.authorize.exception';
import { OauthTokenException } from './exceptions/oauth.token.exception';
import { OauthRepository } from './oauth.repository';
import { AuthorizeError } from './types/authorizationError.type';
import { AuthorizeCacheType } from './types/authorizeCache.type';
import {
  ClientCredentialsGrantContentType,
  CodeGrantContentType,
  GrantContentType,
  RefreshTokenGrantContentType,
} from './types/grant.type';
import { isScope, isTokenScope } from './types/scope.type';
import { TokenCacheType } from './types/tokenCache.type';

// client urls accept any scheme so native apps can register theirs, which also lets a javascript:// url through
const SCRIPT_SCHEMES = ['javascript:', 'data:', 'vbscript:'];
const isRedirectable = (registered: string[], uri: string): boolean =>
  registered.includes(uri) &&
  !SCRIPT_SCHEMES.includes(new URL(uri).protocol.toLowerCase());

@Loggable()
@Trace()
@Injectable()
export class OauthService {
  private readonly CodePrefix = 'code';
  private readonly TokenPrefix = 'token';
  constructor(
    private readonly oauthRepository: OauthRepository,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly clientService: ClientService,
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * the endpoint that returns the public key for the client to verify the jwt token
   * @returns the object that contains the public key for
   */
  certs(): object {
    const sk = crypto.createPrivateKey(
      this.configService
        .getOrThrow<string>('JWT_PRIVATE_KEY')
        .replace(/\\n/g, '\n'),
    );
    const pk = crypto.createPublicKey(sk);
    const kid = (() => {
      const shasum = crypto.createHash('sha1');
      shasum.update(pk.export({ format: 'der', type: 'spki' }));
      return shasum.digest('hex');
    })();
    return {
      keys: [
        {
          ...pk.export({ format: 'jwk' }),
          kid,
          use: 'sig',
          alg: 'ES256',
        },
      ],
    };
  }

  /**
   * make the user consent to the client. through this endpoint, the user can agree to use the client.
   * @param param0 consent request dto
   * @param user user from the request
   */
  async consent({ scope, clientId }: ConsentReqDto, user: User): Promise<void> {
    const client = await this.clientService.getClientByUuid(clientId);
    const allowedScopes = client.scopes.concat(client.optionalScopes);
    // check if the scopes are valid
    scope.forEach((s) => {
      if (!allowedScopes.includes(s)) {
        throw new OauthAuthorizeException('invalid_scope');
      }
    });
    client.scopes.forEach((s) => {
      if (!isScope(s) || !scope.includes(s)) {
        throw new OauthAuthorizeException('invalid_scope');
      }
    });
    // upsert the consent
    await this.oauthRepository.upsertConsent(user.uuid, clientId, scope);
  }

  /**
   * it makes the authorization code and save it to redis since we use oauth2.1, we need to save the code_challenge and code_challenge_method
   * @param authorizeReqDto
   * @param user since this endpoint is requested by the account fe, we can get the user from the request.
   * @returns redirect_uri with query parameters
   */
  async authorize(
    {
      clientId,
      codeChallenge,
      codeChallengeMethod,
      redirectUri,
      scope,
      state,
      nonce,
    }: AuthorizationReqDto,
    user: User,
    auth?: AuthContext,
  ): Promise<string> {
    // client_id and redirect_uri come first: until both are trusted, errors must not be redirected
    const client = await this.clientService
      .getClientByUuid(clientId)
      .catch(() => {
        throw new OauthAuthorizeException('invalid_request');
      });
    if (!isRedirectable(client.urls, redirectUri)) {
      throw new OauthAuthorizeException('invalid_request');
    }

    const consent = await this.oauthRepository
      .findConsent(user.uuid, clientId)
      .catch((error: unknown) => {
        if (error instanceof OauthTokenException) {
          throw new OauthAuthorizeException('access_denied');
        }
        throw error;
      });

    // check if the client has the scope
    scope.forEach((s) => {
      if (!consent.scopes.includes(s) && !isTokenScope(s)) {
        throw new OauthAuthorizeException('invalid_scope');
      }
    });
    // an id_token carries only the claims userinfo already gives this client, so every client may ask for one
    if (scope.includes('openid') && !nonce) {
      throw new OauthAuthorizeException('invalid_request');
    }

    const code = this.generateOpaqueToken();
    await this.redisService.set<AuthorizeCacheType>(
      code,
      {
        clientId,
        UserUuid: user.uuid,
        codeChallenge,
        codeChallengeMethod,
        redirectUri,
        scope,
        nonce,
        ...auth,
      },
      {
        prefix: this.CodePrefix,
        ttl: 10 * 60, // 10 minutes
      },
    );

    const url = new URL(redirectUri);
    url.searchParams.set('code', code);
    url.searchParams.set(
      'iss',
      this.configService.getOrThrow<string>('JWT_ISSUER'),
    );
    if (state) url.searchParams.set('state', state);

    return url.toString();
  }

  /**
   * build the redirect that reports an authorize error to the client, as RFC 6749 section 4.1.2.1 and RFC 9207 describe
   * @param param0 the client, where it asked to be redirected, and the error to report
   * @returns the redirect url, or null when client_id or redirect_uri cannot be trusted and the error must be shown to the user instead
   */
  async authorizeErrorRedirect({
    clientId,
    redirectUri,
    state,
    error,
    errorDescription,
  }: {
    clientId: string | null;
    redirectUri: string | null;
    state?: string | null;
    error: AuthorizeError;
    errorDescription?: string;
  }): Promise<string | null> {
    const url = await this.registeredRedirect(clientId, redirectUri);
    if (!url) return null;

    url.searchParams.set('error', error);
    if (errorDescription) {
      url.searchParams.set('error_description', errorDescription);
    }
    url.searchParams.set(
      'iss',
      this.configService.getOrThrow<string>('JWT_ISSUER'),
    );
    if (state) url.searchParams.set('state', state);

    return url.toString();
  }

  /**
   * build the redirect back to the client after account-fe ended the IdP session, as OIDC RP-Initiated Logout describes
   * @param param0 the client, where it asked to return after logout, and its state
   * @returns the redirect url, or null when client_id or post_logout_redirect_uri cannot be trusted
   */
  async logoutRedirect({
    clientId,
    postLogoutRedirectUri,
    state,
  }: {
    clientId: string;
    postLogoutRedirectUri: string;
    state?: string;
  }): Promise<string | null> {
    const url = await this.registeredRedirect(clientId, postLogoutRedirectUri);
    if (!url) return null;

    if (state) url.searchParams.set('state', state);

    return url.toString();
  }

  private async registeredRedirect(
    clientId: string | null,
    redirectUri: string | null,
  ): Promise<URL | null> {
    if (!clientId || !redirectUri) return null;

    const client = await this.clientService
      .getClientByUuid(clientId)
      .catch(() => null);
    if (!client || !isRedirectable(client.urls, redirectUri)) return null;

    return new URL(redirectUri);
  }

  /**
   * get the token from the request and their return will be different by the grant type (authorization_code, refresh_token, client_credentials)
   * @param grantType the grant type and their content of the request
   * @returns the token response dto
   */
  async token(grantType: GrantContentType): Promise<TokenResDto> {
    switch (grantType.grantType) {
      case 'authorization_code':
        return this.codeGrant(grantType);
      case 'refresh_token':
        return this.refreshTokenGrant(grantType);
      case 'client_credentials':
        return this.clientCredentialsGrant(grantType);
      default:
        throw new OauthTokenException('unsupported_grant_type');
    }
  }

  /**
   * return the token by the code grant
   * @param param0 content of the request
   * @returns tokens
   */
  async codeGrant({
    clientId,
    clientSecret,
    code,
    codeVerifier,
  }: CodeGrantContentType): Promise<TokenResDto> {
    await this.authenticateClient(clientId, clientSecret);

    const cache = await this.redisService
      .getOrThrow<AuthorizeCacheType>(code, {
        prefix: this.CodePrefix,
      })
      .catch(() => {
        throw new OauthTokenException('invalid_grant');
      });

    // delete the code after the first use
    await this.redisService.del(code, {
      prefix: this.CodePrefix,
    });

    if (cache.clientId !== clientId) {
      throw new OauthTokenException('invalid_grant');
    }
    const challenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    if (challenge !== cache.codeChallenge) {
      throw new OauthTokenException('invalid_grant');
    }

    const accessToken = this.generateOpaqueToken();
    await this.redisService.set<TokenCacheType>(
      accessToken,
      {
        to: 'user',
        sub: cache.UserUuid,
        clientId,
        scope: cache.scope,
      },
      {
        prefix: this.TokenPrefix,
        ttl: 3 * 60 * 60, // 3 hours
      },
    );

    let refreshToken = undefined;
    if (cache.scope.includes('offline_access')) {
      refreshToken = this.generateOpaqueToken();
      await this.oauthRepository.createRefreshToken({
        token: refreshToken,
        scopes: cache.scope,
        userUuid: cache.UserUuid,
        clientUuid: cache.clientId,
        nonce: cache.nonce,
        authTime: cache.authTime,
        amr: cache.amr,
      });
    }

    let idToken = undefined;
    if (cache.scope.includes('openid')) {
      const user = await this.userService.findUserByUuid({
        uuid: cache.UserUuid,
      });

      idToken = this.jwtService.sign({
        sub: cache.UserUuid,
        aud: cache.clientId,
        nonce: cache.nonce,
        auth_time: cache.authTime,
        amr: cache.amr,
        scope: cache.scope.join(' '),
        profile: cache.scope.includes('profile') ? user.profile : undefined,
        picture: cache.scope.includes('picture') ? user.picture : undefined,
        name: cache.scope.includes('name') ? user.name : undefined,
        email: cache.scope.includes('email') ? user.email : undefined,
        student_id: cache.scope.includes('student_id')
          ? user.studentId
          : undefined,
        is_student_id_verified: cache.scope.includes('student_id')
          ? user.isIdVerified
          : undefined,
        phone_number: cache.scope.includes('phone_number')
          ? user.phoneNumber
          : undefined,
        is_phone_number_verified: cache.scope.includes('phone_number')
          ? user.isPhoneNumberVerified
          : undefined,
      });
    }

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: 3 * 60 * 60, // 3 hours
      refreshToken: refreshToken,
      refreshTokenExpiresIn: 3 * 30 * 24 * 60 * 60, // 3 months
      idToken,
      scope: cache.scope,
    };
  }

  /**
   * return the token by the refresh token grant
   * @param param0 the content of the request
   * @returns tokens
   */
  async refreshTokenGrant({
    clientId,
    clientSecret,
    refreshToken,
  }: RefreshTokenGrantContentType): Promise<TokenResDto> {
    await this.authenticateClient(clientId, clientSecret);

    if (!refreshToken) {
      throw new OauthTokenException('invalid_request');
    }
    const refreshTokenData =
      await this.oauthRepository.findRefreshTokenByToken(refreshToken);

    if (refreshTokenData.expiresAt < new Date()) {
      await this.oauthRepository.deleteRefreshTokenByToken(refreshToken);
      throw new OauthTokenException('invalid_grant');
    }

    if (refreshTokenData.clientUuid !== clientId) {
      throw new OauthTokenException('invalid_grant');
    }

    const scopes = refreshTokenData.scopes.filter(isScope);
    const auth = authContextOf(refreshTokenData);
    const newRefreshToken = scopes.includes('offline_access')
      ? this.generateOpaqueToken()
      : undefined;
    const rotated = await this.oauthRepository.rotateRefreshToken(
      refreshToken,
      refreshTokenData.familyId,
      newRefreshToken === undefined
        ? undefined
        : {
            token: newRefreshToken,
            scopes,
            userUuid: refreshTokenData.userUuid,
            clientUuid: refreshTokenData.clientUuid,
            nonce: refreshTokenData.nonce,
            familyId: refreshTokenData.familyId,
            ...auth,
          },
    );
    if (!rotated) throw new OauthTokenException('invalid_grant');

    const accessToken = this.generateOpaqueToken();
    await this.redisService.set<TokenCacheType>(
      accessToken,
      {
        to: 'user',
        sub: refreshTokenData.userUuid,
        clientId,
        scope: scopes,
      },
      {
        prefix: this.TokenPrefix,
        ttl: 3 * 60 * 60, // 3 hours
      },
    );

    let idToken = undefined;
    if (scopes.includes('openid')) {
      const user = await this.userService.findUserByUuid({
        uuid: refreshTokenData.userUuid,
      });

      idToken = this.jwtService.sign({
        sub: refreshTokenData.userUuid,
        aud: refreshTokenData.clientUuid,
        scope: scopes.join(' '),
        nonce: refreshTokenData.nonce ?? undefined,
        auth_time: auth.authTime,
        amr: auth.amr,
        profile: scopes.includes('profile') ? user.profile : undefined,
        picture: scopes.includes('picture') ? user.picture : undefined,
        name: scopes.includes('name') ? user.name : undefined,
        email: scopes.includes('email') ? user.email : undefined,
        student_id: scopes.includes('student_id') ? user.studentId : undefined,
        is_student_id_verified: scopes.includes('student_id')
          ? user.isIdVerified
          : undefined,
        phone_number: scopes.includes('phone_number')
          ? user.phoneNumber
          : undefined,
        is_phone_number_verified: scopes.includes('phone_number')
          ? user.isPhoneNumberVerified
          : undefined,
      });
    }

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: 3 * 60 * 60, // 3 hours
      refreshToken: newRefreshToken,
      refreshTokenExpiresIn: 3 * 30 * 24 * 60 * 60, // 3 months
      idToken,
      scope: scopes,
    };
  }

  /**
   * return the token by the client credentials grant
   * @param param0 the content of the request
   * @returns tokens
   */
  async clientCredentialsGrant({
    clientId,
    clientSecret,
    scope,
  }: ClientCredentialsGrantContentType): Promise<TokenResDto> {
    const client = await this.findClient(clientId);
    // clients registered before tokenEndpointAuthMethod are none but already call this grant with their secret (pot-g-be)
    this.verifySecret(client, clientSecret);

    scope.forEach((s) => {
      if (!client.scopes.includes(s) && !client.optionalScopes.includes(s)) {
        throw new OauthTokenException('invalid_scope');
      }
    });

    const accessToken = this.generateOpaqueToken();
    await this.redisService.set<TokenCacheType>(
      accessToken,
      {
        to: 'client',
        clientId,
        scope,
      },
      {
        prefix: this.TokenPrefix,
        ttl: 3 * 30 * 24 * 60 * 60, // 3 months
      },
    );

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: 3 * 30 * 24 * 60 * 60, // 3 months
      scope,
    };
  }

  /**
   * revoke a token issued to the client, as RFC 7009 describes. unknown tokens and tokens of other
   * clients are ignored, so the response does not reveal whether a token exists.
   * @param param0 token, token type hint and client credentials
   */
  async revoke({
    token,
    tokenTypeHint,
    clientId,
    clientSecret,
  }: RevokeReqDto): Promise<void> {
    const client = await this.authenticateClient(clientId, clientSecret);
    const order =
      tokenTypeHint === 'refresh_token'
        ? (['refresh_token', 'access_token'] as const)
        : (['access_token', 'refresh_token'] as const);

    for (const type of order) {
      if (await this.revokeIfIssuedTo(token, type, client)) return;
    }
  }

  /**
   * revoke the token by the token type hint, as DELETE /oauth/token always did.
   * @deprecated use {@link OauthService.revoke}, which authenticates the client as RFC 7009 requires.
   * @param param0 token and token type hint
   */
  async revokeDeprecated({
    token,
    tokenTypeHint,
  }: RevokeReqDto): Promise<void> {
    if (tokenTypeHint === 'access_token') {
      await this.redisService.del(token, { prefix: this.TokenPrefix });
    } else if (tokenTypeHint === 'refresh_token') {
      await this.oauthRepository.deleteRefreshTokenByToken(token);
    } else {
      throw new BadRequestException({ error: 'invalid_request' });
    }
  }

  private async revokeIfIssuedTo(
    token: string,
    type: 'access_token' | 'refresh_token',
    clientId: string,
  ): Promise<boolean> {
    if (type === 'access_token') {
      const cached = await this.redisService.get<TokenCacheType>(token, {
        prefix: this.TokenPrefix,
      });
      if (cached?.clientId !== clientId) return false;

      await this.redisService.del(token, { prefix: this.TokenPrefix });
      return true;
    }

    const stored = await this.oauthRepository
      .findRefreshTokenByToken(token)
      .catch((error) => {
        if (error instanceof OauthTokenException) return null;
        throw error;
      });
    if (stored?.clientUuid !== clientId) return false;

    await this.oauthRepository.deleteRefreshTokenFamily(stored.familyId);
    return true;
  }

  /**
   * return the user info by the access token
   * @param token the access token
   * @param userUuid the user uuid if use client credential, it is required
   * @returns the user info
   */
  async userinfo(token: string, userUuid?: string): Promise<UserInfoResDto> {
    const tokenData = await this.redisService
      .getOrThrow<TokenCacheType>(token, {
        prefix: this.TokenPrefix,
      })
      .catch((error) => {
        if (error instanceof CacheNotFoundException) {
          throw new UnauthorizedException();
        }
        throw error;
      });

    let user: User;
    let scopes: readonly string[] = tokenData.scope;
    if (tokenData.to === 'client') {
      if (!userUuid) {
        throw new UnauthorizedException();
      }
      // an unknown user and one who never consented get the same 404, so a client cannot probe which subs exist
      const consent = isUUID(userUuid)
        ? await this.oauthRepository
            .findConsent(userUuid, tokenData.clientId)
            .catch((error: unknown) => {
              if (error instanceof OauthTokenException) return null;
              throw error;
            })
        : null;
      if (!consent) {
        throw new NotFoundException();
      }
      // the token may carry optional scopes this user declined
      scopes = tokenData.scope.filter((s) => consent.scopes.includes(s));
      user = await this.userService.findUserByUuid({
        uuid: userUuid,
      });
    } else {
      if (!tokenData.sub) {
        throw new UnauthorizedException();
      }
      user = await this.userService.findUserByUuid({
        uuid: tokenData.sub,
      });
    }

    return {
      sub: user.uuid,
      name: scopes.includes('name') ? user.name : undefined,
      profile: scopes.includes('profile') ? user.profile : undefined,
      picture: scopes.includes('picture') ? user.picture : undefined,
      email: scopes.includes('email') ? user.email : undefined,
      studentId: scopes.includes('student_id') ? user.studentId : undefined,
      isStudentIdVerified: scopes.includes('student_id')
        ? user.isIdVerified
        : undefined,
      phoneNumber: scopes.includes('phone_number')
        ? user.phoneNumber
        : undefined,
      isPhoneNumberVerified: scopes.includes('phone_number')
        ? user.isPhoneNumberVerified
        : undefined,
    };
  }

  /**
   * authenticate the client at the token endpoint. confidential clients must present their secret,
   * public clients (browsers, apps) cannot keep one and rely on PKCE alone.
   * @param clientId client id from the body or basic auth
   * @param clientSecret client secret from the body or basic auth
   */
  private async authenticateClient(
    clientId: string | undefined,
    clientSecret: string | undefined,
  ): Promise<string> {
    const client = await this.findClient(clientId);
    if (client.tokenEndpointAuthMethod !== 'none') {
      this.verifySecret(client, clientSecret);
    }
    return client.uuid;
  }

  private async findClient(clientId: string | undefined): Promise<Client> {
    if (!clientId) {
      throw new OauthTokenException('invalid_client');
    }
    return this.clientService.getClientByUuid(clientId).catch(() => {
      throw new OauthTokenException('invalid_client');
    });
  }

  private verifySecret(client: Client, clientSecret: string | undefined): void {
    if (!clientSecret || !bcrypt.compareSync(clientSecret, client.secret)) {
      throw new OauthTokenException('invalid_client');
    }
  }

  /**
   * generate opaque token that does not have any meaning
   * @returns opaque token
   */
  private generateOpaqueToken(): string {
    return crypto.randomBytes(32).toString('base64url');
  }
}

// refresh tokens stored before auth_time was kept have neither, and their id_tokens omit both claims
function authContextOf({ authTime, amr }: RefreshToken): Partial<AuthContext> {
  return {
    authTime: authTime ? Math.floor(authTime.getTime() / 1000) : undefined,
    amr: amr.length ? amr : undefined,
  };
}
