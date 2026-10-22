import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { AuthenticatedRequest } from '../guard/auth.strategy';
import { AuthContext } from '../types/authContext.type';

export const GetAuthContext = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): AuthContext | undefined =>
    ctx.switchToHttp().getRequest<AuthenticatedRequest>().authContext,
);
