import { Trace } from '@gsainfoteam/nest-observability';
import { Loggable } from '@lib/logger';
import { PrismaService } from '@lib/prisma';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Consent, RefreshToken } from '@prisma/client';
import { AuthContext } from 'src/auth/types/authContext.type';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

import { OauthTokenException } from './exceptions/oauth.token.exception';

const MAX_REFRESH_TOKEN_AGE = 60 * 60 * 24 * 30; // 30 days

@Trace()
@Loggable()
@Injectable()
export class OauthRepository {
  private readonly logger = new Logger(OauthRepository.name);
  constructor(private readonly prismaService: PrismaService) {}

  async findRefreshTokenByToken(token: string): Promise<RefreshToken> {
    const refreshToken = await this.prismaService.refreshToken
      .findUniqueOrThrow({
        where: {
          token,
        },
      })
      .catch((error) => {
        if (error instanceof PrismaClientKnownRequestError) {
          if (error.code === 'P2025') {
            this.logger.debug(`Refresh token not found: ${token}`);
            throw new OauthTokenException('invalid_grant');
          }
          this.logger.error('database error', error);
        }
        this.logger.error('unknown error', error);
        throw new InternalServerErrorException();
      });
    if (refreshToken.expiresAt < new Date()) {
      this.logger.debug(`Refresh token expired: ${token}`);
      throw new OauthTokenException('invalid_grant');
    }
    return refreshToken;
  }

  async createRefreshToken({
    authTime,
    ...refreshToken
  }: Pick<RefreshToken, 'token' | 'scopes' | 'userUuid' | 'clientUuid'> &
    Partial<Pick<RefreshToken, 'nonce' | 'familyId'>> &
    Partial<AuthContext>): Promise<RefreshToken> {
    return this.prismaService.refreshToken.create({
      data: {
        ...refreshToken,
        authTime:
          authTime === undefined ? undefined : new Date(authTime * 1000),
        expiresAt: new Date(Date.now() + MAX_REFRESH_TOKEN_AGE * 1000),
      },
    });
  }

  /**
   * mark the refresh token as rotated, unless another request already did
   * @param token the refresh token being rotated
   * @returns whether this call marked it, so two requests racing with the same token cannot both win
   */
  async markRefreshTokenUsed(token: string): Promise<boolean> {
    const { count } = await this.prismaService.refreshToken.updateMany({
      where: { token, usedAt: null },
      data: { usedAt: new Date() },
    });
    return count === 1;
  }

  /**
   * delete every refresh token of the family, ending the authorization they came from
   * @param familyId the family to delete
   */
  async deleteRefreshTokenFamily(familyId: string): Promise<void> {
    await this.prismaService.refreshToken.deleteMany({ where: { familyId } });
  }

  /**
   * delete the expired tokens of the family. rotated tokens are kept until they expire to catch reuse
   * @param familyId the family to prune
   */
  async pruneRefreshTokenFamily(familyId: string): Promise<void> {
    await this.prismaService.refreshToken.deleteMany({
      where: { familyId, expiresAt: { lt: new Date() } },
    });
  }

  async deleteRefreshTokenByToken(token: string): Promise<void> {
    await this.prismaService.refreshToken
      .delete({
        where: {
          token,
        },
      })
      .catch((error) => {
        if (error instanceof PrismaClientKnownRequestError) {
          if (error.code === 'P2025') {
            this.logger.debug(`Refresh token not found: ${token}`);
            throw new OauthTokenException('invalid_grant');
          }
          this.logger.error('database error', error);
        }
        this.logger.error('unknown error', error);
        throw new InternalServerErrorException();
      });
  }

  async findConsent(userUuid: string, clientUuid: string): Promise<Consent> {
    return this.prismaService.consent
      .findUniqueOrThrow({
        where: {
          clientUuid_userUuid: {
            clientUuid,
            userUuid,
          },
        },
      })
      .catch((error) => {
        if (error instanceof PrismaClientKnownRequestError) {
          if (error.code === 'P2025') {
            this.logger.debug(`Consent not found: ${clientUuid} ${userUuid}`);
            throw new OauthTokenException('invalid_grant');
          }
          this.logger.error('database error', error);
        }
        this.logger.error('unknown error', error);
        throw new InternalServerErrorException();
      });
  }

  async upsertConsent(
    userUuid: string,
    clientUuid: string,
    scopes: string[],
  ): Promise<void> {
    await this.prismaService.consent.upsert({
      where: {
        clientUuid_userUuid: {
          clientUuid,
          userUuid,
        },
      },
      create: {
        userUuid,
        clientUuid,
        scopes,
      },
      update: {
        scopes,
      },
    });
  }
}
