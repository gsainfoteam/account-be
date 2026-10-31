import {
  type Scope,
  SCOPES,
  TOKEN_SCOPES,
  type TokenScope,
} from '@gsainfoteam/account-contract';

export const TokenScopeList = TOKEN_SCOPES;
export type TokenScopeType = TokenScope;

export const ScopeList = SCOPES;
export type ScopeType = Scope;

export function isTokenScope(value: string): value is TokenScopeType {
  return TokenScopeList.some((scope) => scope === value);
}

export function isScope(value: string): value is ScopeType {
  return ScopeList.some((scope) => scope === value);
}
