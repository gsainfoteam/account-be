// how and when the user signed in to the IdP, carried into id_tokens as auth_time and amr (OIDC Core 2, RFC 8176)
export type AuthContext = {
  authTime: number; // seconds since the epoch
  amr: string[];
};
