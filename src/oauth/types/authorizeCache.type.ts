import { AuthContext } from 'src/auth/types/authContext.type';

import { CodeChallengeMethod } from './codeChallengeMethod.type';
import { ScopeType } from './scope.type';

export type AuthorizeCacheType = {
  clientId: string;
  UserUuid: string;
  codeChallengeMethod: CodeChallengeMethod;
  codeChallenge: string;
  redirectUri: string;
  scope: ScopeType[];
  nonce?: string;
} & Partial<AuthContext>;
