import { CLIENT_SCOPES, type ClientScope } from '@gsainfoteam/account-contract';

export const ClientScopeList = CLIENT_SCOPES;
export type ClientScopeType = ClientScope;

export function isClientScope(value: string): value is ClientScopeType {
  return ClientScopeList.some((scope) => scope === value);
}
