import { ScopeType } from './scope.type';

export const GrantTypeList = [
  'authorization_code',
  'client_credentials',
  'refresh_token',
];

export type GrantType = (typeof GrantTypeList)[number];

export type GrantContentType =
  | CodeGrantContentType
  | RefreshTokenGrantContentType
  | ClientCredentialsGrantContentType;

export type CodeGrantContentType = {
  grantType: 'authorization_code';
  clientId: string;
  clientSecret?: string;

  code: string;
  codeVerifier: string;
};

// Basic Auth in headers or use the client_id
export type RefreshTokenGrantContentType = {
  grantType: 'refresh_token';
  clientId?: string;
  clientSecret?: string;

  refreshToken: string;
};

export type ClientCredentialsGrantContentType = {
  grantType: 'client_credentials';
  clientId: string;

  clientSecret: string;
  scope: ScopeType[];
};
