import { CODE_CHALLENGE_METHOD } from '@gsainfoteam/account-contract';

export const CodeChallengeMethodList = [CODE_CHALLENGE_METHOD] as const;
export type CodeChallengeMethod = (typeof CodeChallengeMethodList)[number];
