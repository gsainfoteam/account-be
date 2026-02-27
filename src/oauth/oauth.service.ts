import { Loggable } from '@lib/logger';
import { RedisService } from '@lib/redis';
import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
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
import { AuthorizeCacheType } from './types/authorizeCache.type';
import {
  ClientCredentialsGrantContentType,
  CodeGrantContentType,
  GrantContentType,
  RefreshTokenGrantContentType,
} from './types/grant.type';
import { TokenScopeList } from './types/scope.type';
import { TokenCacheType } from './types/tokenCache.type';

@Loggable()
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
      if (!scope.includes(s)) {
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
  ): Promise<string> {
    // recommend: integrate the query below two lines.
    const client = await this.clientService
      .getClientByUuid(clientId)
      .catch(() => {
        throw new OauthAuthorizeException('unauthorized_client');
      });
    const consent = await this.oauthRepository.findConsent(user.uuid, clientId);

    // check if the client has the scope
    scope.forEach((s) => {
      if (!consent.scopes.includes(s) && !TokenScopeList.includes(s)) {
        throw new OauthAuthorizeException('invalid_scope');
      }
    });
    // check if the redirect_uri is in the client's urls
    if (!client.urls.includes(redirectUri)) {
      throw new OauthAuthorizeException('access_denied');
    }
    // check if the id token is supported
    if (scope.includes('openid')) {
      if (!client.idTokenAllowed) {
        throw new OauthAuthorizeException('invalid_scope');
      }
      if (!nonce) {
        throw new OauthAuthorizeException('invalid_request');
      }
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
      },
      {
        prefix: this.CodePrefix,
        ttl: 10 * 60, // 10 minutes
      },
    );

    return (
      `${redirectUri}?code=${code}&iss=${this.configService.getOrThrow<string>('JWT_ISSUER')}` +
      (state ? `&state=${state}` : '')
    );
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
    code,
    codeVerifier,
  }: CodeGrantContentType): Promise<TokenResDto> {
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
      throw new OauthTokenException('invalid_client');
    }
    if (cache.codeChallengeMethod === 'S256') {
      const hash = crypto
        .createHash('sha256')
        .update(codeVerifier)
        .digest('base64url');
      if (hash !== cache.codeChallenge) {
        throw new OauthTokenException('invalid_grant');
      }
    } else if (cache.codeChallengeMethod === 'plain') {
      if (codeVerifier !== cache.codeChallenge) {
        throw new OauthTokenException('invalid_grant');
      }
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
      await this.oauthRepository.createRefreshToken(
        refreshToken,
        cache.scope,
        cache.UserUuid,
        cache.clientId,
      );
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
        scope: cache.scope.join(' '),
        profile: cache.scope.includes('profile') ? user.profile : undefined,
        picture: cache.scope.includes('picture') ? user.picture : undefined,
        name: cache.scope.includes('name') ? user.name : undefined,
        email: cache.scope.includes('email') ? user.email : undefined,
        student_id: cache.scope.includes('student_id')
          ? user.studentId
          : undefined,
        phone_number: cache.scope.includes('phone_number')
          ? user.phoneNumber
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
    refreshToken,
  }: RefreshTokenGrantContentType): Promise<TokenResDto> {
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

    const accessToken = this.generateOpaqueToken();
    await this.redisService.set<TokenCacheType>(
      accessToken,
      {
        to: 'user',
        sub: refreshTokenData.userUuid,
        clientId,
        scope: refreshTokenData.scopes,
      },
      {
        prefix: this.TokenPrefix,
        ttl: 3 * 60 * 60, // 3 hours
      },
    );

    let newRefreshToken = undefined;
    if (refreshTokenData.scopes.includes('offline_access')) {
      newRefreshToken = this.generateOpaqueToken();
      await this.oauthRepository.createRefreshToken(
        newRefreshToken,
        refreshTokenData.scopes,
        refreshTokenData.userUuid,
        refreshTokenData.clientUuid,
      );
    }

    let idToken = undefined;
    if (refreshTokenData.scopes.includes('openid')) {
      if (!refreshTokenData.nonce) {
        throw new OauthTokenException('invalid_request');
      }
      const user = await this.userService.findUserByUuid({
        uuid: refreshTokenData.userUuid,
      });

      idToken = this.jwtService.sign({
        sub: refreshTokenData.userUuid,
        aud: refreshTokenData.clientUuid,
        scope: refreshTokenData.scopes.join(' '),
        nonce: refreshTokenData.nonce,
        profile: refreshTokenData.scopes.includes('profile')
          ? user.profile
          : undefined,
        picture: refreshTokenData.scopes.includes('picture')
          ? user.picture
          : undefined,
        name: refreshTokenData.scopes.includes('name') ? user.name : undefined,
        email: refreshTokenData.scopes.includes('email')
          ? user.email
          : undefined,
        student_id: refreshTokenData.scopes.includes('student_id')
          ? user.studentId
          : undefined,
        phone_number: refreshTokenData.scopes.includes('phone_number')
          ? user.phoneNumber
          : undefined,
      });
    }
    await this.oauthRepository.deleteRefreshTokenByToken(refreshToken);

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: 3 * 60 * 60, // 3 hours
      refreshToken: newRefreshToken,
      refreshTokenExpiresIn: 3 * 30 * 24 * 60 * 60, // 3 months
      idToken,
      scope: refreshTokenData.scopes,
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
    const client = await this.clientService.getClientByUuid(clientId);

    if (!bcrypt.compareSync(clientSecret, client.secret)) {
      throw new OauthTokenException('invalid_client');
    }

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
   * revoke the token by the token type hint
   * @param param0 tokens and token type hint
   */
  async revoke({ token, tokenTypeHint }: RevokeReqDto): Promise<void> {
    if (tokenTypeHint === 'access_token') {
      await this.redisService.del(token, {
        prefix: this.TokenPrefix,
      });
    } else if (tokenTypeHint === 'refresh_token') {
      await this.oauthRepository.deleteRefreshTokenByToken(token);
    } else {
      throw new BadRequestException({
        error: 'invalid_request',
      });
    }
  }

  /**
   * return the user info by the access token
   * @param token the access token
   * @param userUuid the user uuid if use client credential, it is required
   * @returns the user info
   */
  async userinfo(token: string, userUuid?: string): Promise<UserInfoResDto> {
    const tokenData = await this.redisService.getOrThrow<TokenCacheType>(
      token,
      {
        prefix: this.TokenPrefix,
      },
    );

    let user: User;
    if (tokenData.to === 'client') {
      if (!userUuid) {
        throw new UnauthorizedException();
      }
      const consent = await this.oauthRepository.findConsent(
        userUuid,
        tokenData.clientId,
      );
      if (!consent) {
        throw new UnauthorizedException();
      }
      consent.scopes.forEach((v) => {
        if (!tokenData.scope.includes(v)) {
          throw new UnauthorizedException();
        }
      });
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
      name: tokenData.scope.includes('name') ? user.name : undefined,
      profile: tokenData.scope.includes('profile') ? user.profile : undefined,
      picture: tokenData.scope.includes('picture') ? user.picture : undefined,
      email: tokenData.scope.includes('email') ? user.email : undefined,
      studentId: tokenData.scope.includes('student_id')
        ? user.studentId
        : undefined,
      isStudentIdVerified: tokenData.scope.includes('student_id')
        ? user.isIdVerified
        : undefined,
      phoneNumber: tokenData.scope.includes('phone_number')
        ? user.phoneNumber
        : undefined,
      isPhoneNumberVerified: tokenData.scope.includes('phone_number')
        ? user.isPhoneNumberVerified
        : undefined,
    };
  }

  /**
   * generate opaque token that does not have any meaning
   * @returns opaque token
   */
  private generateOpaqueToken(): string {
    return crypto.randomBytes(32).toString('base64url');
  }
}
