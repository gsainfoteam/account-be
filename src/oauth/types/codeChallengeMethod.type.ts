// OAuth 2.1 drops the plain method: a verifier sent in the clear protects nothing
export const CodeChallengeMethodList = ['S256'] as const;
export type CodeChallengeMethod = (typeof CodeChallengeMethodList)[number];
