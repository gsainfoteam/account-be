import {
  CODE_CHALLENGE_METHOD,
  GRANT_TYPES,
  IDP_PAGE_PATHS,
  SCOPE_CLAIMS,
  SCOPES,
  TOKEN_ENDPOINT_AUTH_METHODS,
} from '@gsainfoteam/account-contract';
import { Trace } from '@gsainfoteam/nest-observability';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
@Trace()
export class WellKnownService {
  private readonly issuer: string;
  private readonly baseUrl: string;
  private readonly loginOrigin: string;
  constructor(private readonly configService: ConfigService) {
    // the same issuer the id_token and the authorize response carry, as OIDC Discovery requires
    this.issuer = this.configService.getOrThrow('JWT_ISSUER');
    this.baseUrl = this.configService.getOrThrow('BASE_URL');
    // account-fe origin. WebAuthn already requires it to match the login page exactly
    this.loginOrigin = this.configService.getOrThrow('PASSKEY_RP_ORIGIN');
  }

  discovery(): object {
    return {
      issuer: this.issuer,
      authorization_endpoint: new URL(
        IDP_PAGE_PATHS.authorize,
        this.loginOrigin,
      ).toString(),
      end_session_endpoint: new URL(
        IDP_PAGE_PATHS.logout,
        this.loginOrigin,
      ).toString(),
      token_endpoint: `${this.baseUrl}/oauth/token`,
      userinfo_endpoint: `${this.baseUrl}/oauth/userinfo`,
      jwks_uri: `${this.baseUrl}/oauth/certs`,
      revocation_endpoint: `${this.baseUrl}/oauth/revoke`,
      response_types_supported: ['code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['ES256'],
      scopes_supported: SCOPES,
      code_challenge_methods_supported: [CODE_CHALLENGE_METHOD],
      token_endpoint_auth_methods_supported: TOKEN_ENDPOINT_AUTH_METHODS,
      revocation_endpoint_auth_methods_supported: TOKEN_ENDPOINT_AUTH_METHODS,
      claims_supported: [
        'sub',
        'aud',
        'exp',
        'iat',
        'iss',
        'auth_time',
        'amr',
        'nonce',
        ...new Set(Object.values(SCOPE_CLAIMS).flat()),
      ],
      grant_types_supported: GRANT_TYPES,
    };
  }
}
