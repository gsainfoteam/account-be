import { ClientScopeList } from 'src/client/types/clientScopes.type';

export const TokenScopeList = ['openid', 'offline_access'] as const;
export type TokenScopeType = (typeof TokenScopeList)[number];

export const ScopeList = [...ClientScopeList, ...TokenScopeList] as const;
export type ScopeType = (typeof ScopeList)[number];

export function isTokenScope(value: string): value is TokenScopeType {
  return TokenScopeList.some((scope) => scope === value);
}

export function isScope(value: string): value is ScopeType {
  return ScopeList.some((scope) => scope === value);
}
