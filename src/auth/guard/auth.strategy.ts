import { accessTokenExtractor } from '@lib/global';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { User } from '@prisma/client';
import { FastifyRequest } from 'fastify';
import { JwtPayload } from 'jsonwebtoken';
import { Strategy } from 'passport-jwt';

import { AuthService } from '../auth.service';
import { AuthContext } from '../types/authContext.type';

export type AuthenticatedRequest = FastifyRequest & {
  user: User;
  authContext?: AuthContext;
};

@Injectable()
export class UserStrategy extends PassportStrategy(Strategy, 'user:jwt') {
  constructor(
    readonly authService: AuthService,
    readonly configService: ConfigService,
  ) {
    super({
      jwtFromRequest: accessTokenExtractor,
      issuer: configService.getOrThrow<string>('JWT_ISSUER'),
      audience: configService.getOrThrow<string>('JWT_AUDIENCE'),
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
      passReqToCallback: true,
    });
  }

  async validate(
    request: Omit<AuthenticatedRequest, 'user'>,
    payload: JwtPayload,
  ): Promise<User> {
    if (!payload.sub) throw new UnauthorizedException('invalid token');
    request.authContext = authContextOf(payload);
    return this.authService.findUserByUuid(payload.sub);
  }
}

function authContextOf(payload: JwtPayload): AuthContext | undefined {
  const authTime: unknown = payload.auth_time;
  const amr: unknown = payload.amr;
  if (typeof authTime !== 'number' || !Array.isArray(amr)) return undefined;

  return {
    authTime,
    amr: amr.filter((method): method is string => typeof method === 'string'),
  };
}
