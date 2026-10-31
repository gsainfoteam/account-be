import { AMR } from '@gsainfoteam/account-contract';
import { Trace } from '@gsainfoteam/nest-observability';
import { Loggable } from '@lib/logger/decorator/loggable';
import { ObjectService } from '@lib/object';
import { RedisService } from '@lib/redis';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { AuthenticationResponseJSON } from '@simplewebauthn/types';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import ms, { StringValue } from 'ms';

import { AuthRepository } from './auth.repository';
import { LoginDto } from './dto/req.dto';
import { PasskeyAuthOptionResDto } from './dto/res.dto';
import { AuthContext } from './types/authContext.type';
import { LoginResultType } from './types/loginResult.type';

type RefreshTokenCache = Pick<User, 'uuid'> & Partial<AuthContext>;

@Injectable()
@Loggable()
@Trace()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly accessTokenExpireTime: number;
  private readonly refreshTokenExpireTime: number;
  private readonly refreshTokenPrefix = 'refreshToken';
  private readonly passkeyPrefix = 'passkey';
  private readonly passkeyRpOrigin: string;
  private readonly passkeyRpId: string;

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly jwtService: JwtService,
    private readonly objectService: ObjectService,
  ) {
    this.accessTokenExpireTime = ms(
      configService.getOrThrow<string>('JWT_EXPIRE') as StringValue,
    );
    this.refreshTokenExpireTime = ms(
      configService.getOrThrow<string>('REFRESH_TOKEN_EXPIRE') as StringValue,
    );
    this.passkeyRpOrigin =
      this.configService.getOrThrow<string>('PASSKEY_RP_ORIGIN');
    this.passkeyRpId = this.configService.getOrThrow<string>('PASSKEY_RP_ID');
  }

  async login({ email, password }: LoginDto): Promise<LoginResultType> {
    const user = await this.authRepository.findUserByEmail(email);
    if (!bcrypt.compareSync(password, user.password)) {
      this.logger.debug(`password not matched: ${email}`);
      throw new UnauthorizedException();
    }

    return this.issueTokens(user.uuid, [...AMR.password]);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.redisService.del(refreshToken, {
      prefix: this.refreshTokenPrefix,
    });
  }

  async refresh(refreshToken: string): Promise<LoginResultType> {
    if (!refreshToken) throw new UnauthorizedException();
    const cachedUser = await this.redisService
      .getOrThrow<RefreshTokenCache>(refreshToken, {
        prefix: this.refreshTokenPrefix,
      })
      .catch(() => {
        this.logger.debug(`refreshToken not found: ${refreshToken}`);
        throw new UnauthorizedException();
      });
    const user = await this.authRepository.findUserByUuid(cachedUser.uuid); // for checking user existence

    await this.redisService.del(refreshToken, {
      prefix: this.refreshTokenPrefix,
    });

    const newRefreshToken: string = this.generateOpaqueToken();
    void this.redisService.set<RefreshTokenCache>(newRefreshToken, cachedUser, {
      prefix: this.refreshTokenPrefix,
      ttl: this.refreshTokenExpireTime,
    });

    return {
      accessToken: this.signAccessToken(user.uuid, cachedUser),
      refreshToken: newRefreshToken,
      accessTokenExpireTime: this.accessTokenExpireTime,
      refreshTokenExpireTime: this.refreshTokenExpireTime,
    };
  }

  async findUserByUuid(uuid: string): Promise<User> {
    const user = await this.authRepository.findUserByUuid(uuid);
    return {
      ...user,
      picture:
        user.picture === null ? null : this.objectService.getUrl(user.picture),
    };
  }

  async authenticateOptions(): Promise<PasskeyAuthOptionResDto> {
    const options = await generateAuthenticationOptions({
      rpID: this.passkeyRpId,
    });
    const key = crypto.randomUUID();

    await this.redisService.set<string>(key, options.challenge, {
      prefix: this.passkeyPrefix,
      ttl: 10 * 60,
    });

    return { key, ...options };
  }

  async verifyAuthentication(
    key: string,
    response: AuthenticationResponseJSON,
  ): Promise<LoginResultType> {
    const expectedChallenge = await this.redisService.getOrThrow<string>(key, {
      prefix: this.passkeyPrefix,
    });
    if (!expectedChallenge) throw new UnauthorizedException();

    await this.redisService.del(key, { prefix: this.passkeyPrefix });

    const authenticator = await this.authRepository.findAuthenticator(
      response.id,
    );

    const { verified, authenticationInfo } = await verifyAuthenticationResponse(
      {
        response,
        expectedChallenge,
        expectedOrigin: this.passkeyRpOrigin,
        expectedRPID: this.passkeyRpId,
        credential: {
          ...authenticator,
        },
        requireUserVerification: true,
      },
    );

    if (!verified) {
      throw new UnauthorizedException();
    }

    await this.authRepository.updatePasskeyCounter(
      authenticator.id,
      authenticationInfo.newCounter,
    );

    // requireUserVerification above makes the authenticator check the user too
    return this.issueTokens(authenticator.userUuid, [...AMR.passkey]);
  }

  /**
   * 유저의 정보와 상관이 없은 토큰을 만들어내는 함수.
   * @returns Opaque token
   */
  private generateOpaqueToken() {
    return crypto
      .randomBytes(32)
      .toString('base64')
      .replace(/[+//=]/g, '');
  }

  private async issueTokens(
    uuid: string,
    amr: string[],
  ): Promise<LoginResultType> {
    const auth: AuthContext = {
      authTime: Math.floor(Date.now() / 1000),
      amr,
    };
    const refreshToken: string = this.generateOpaqueToken();
    await this.redisService.set<RefreshTokenCache>(
      refreshToken,
      {
        uuid,
        ...auth,
      },
      {
        prefix: this.refreshTokenPrefix,
        ttl: this.refreshTokenExpireTime,
      },
    );
    return {
      accessToken: this.signAccessToken(uuid, auth),
      refreshToken,
      accessTokenExpireTime: this.accessTokenExpireTime,
      refreshTokenExpireTime: this.refreshTokenExpireTime,
    };
  }

  // sessions from before auth_time was kept have neither claim, and the id_token then omits them
  private signAccessToken(
    uuid: string,
    { authTime, amr }: Partial<AuthContext>,
  ): string {
    return this.jwtService.sign(
      { auth_time: authTime, amr },
      { subject: uuid },
    );
  }
}
