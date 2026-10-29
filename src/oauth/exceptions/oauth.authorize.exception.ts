import { BadRequestException } from '@nestjs/common';

import { AuthorizeError } from '../types/authorizationError.type';

export class OauthAuthorizeException extends BadRequestException {
  constructor(readonly error: AuthorizeError) {
    super({
      error,
    });
  }
}
