import { Trace } from '@gsainfoteam/nest-observability';
import { Loggable } from '@lib/logger';
import { PrismaService } from '@lib/prisma';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Consent, Prisma, RefreshToken } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { AuthContext } from 'src/auth/types/authContext.type';

import { OauthTokenException } from './exceptions/oauth.token.exception';

const MAX_REFRESH_TOKEN_AGE = 60 * 60 * 24 * 30; // 30 days

type NewRefreshToken = Pick<
  RefreshToken,
  'token' | 'scopes' | 'userUuid' | 'clientUuid'
> &
  Partial<Pick<RefreshToken, 'nonce' | 'familyId'>> &
  Partial<AuthContext>;

function toCreateData({ authTime, ...refreshToken }: NewRefreshToken) {
  return {
    ...refreshToken,
    authTime: authTime === undefined ? undefined : new Date(authTime * 1000),
    expiresAt: new Date(Date.now() + MAX_REFRESH_TOKEN_AGE * 1000),
  };
}

// without it a family deleted for reuse could get a new token from a rotation committing right after,
// since the delete does not see rows inserted after it started
async function lockFamily(tx: Prisma.TransactionClient, familyId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${familyId}))`;
}

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

  async createRefreshToken(
    refreshToken: NewRefreshToken,
  ): Promise<RefreshToken> {
    return this.prismaService.refreshToken.create({
      data: toCreateData(refreshToken),
    });
  }

  /**
   * mark the presented refresh token as used and issue the next one of its family.
   * a token that was already used means it leaked, so the whole family is deleted instead (OAuth 2.1 section 4.3.1)
   * @returns false when the token was already used, by an earlier request or one racing this one
   */
  async rotateRefreshToken(
    token: string,
    familyId: string,
    next?: NewRefreshToken,
  ): Promise<boolean> {
    return this.prismaService.$transaction(async (tx) => {
      await lockFamily(tx, familyId);
      const { count } = await tx.refreshToken.updateMany({
        where: { token, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (count !== 1) {
        await tx.refreshToken.deleteMany({ where: { familyId } });
        return false;
      }

      // rotated tokens stay until they expire so that their reuse is caught
      await tx.refreshToken.deleteMany({
        where: { familyId, expiresAt: { lt: new Date() } },
      });
      if (next) await tx.refreshToken.create({ data: toCreateData(next) });
      return true;
    });
  }

  /**
   * delete every refresh token of the family, ending the authorization they came from
   * @param familyId the family to delete
   */
  async deleteRefreshTokenFamily(familyId: string): Promise<void> {
    await this.prismaService.$transaction(async (tx) => {
      await lockFamily(tx, familyId);
      await tx.refreshToken.deleteMany({ where: { familyId } });
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
