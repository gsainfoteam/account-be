import { Trace } from '@gsainfoteam/nest-observability';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientScopeList } from 'src/client/types/clientScopes.type';
import { ScopeList } from 'src/oauth/types/scope.type';

@Injectable()
@Trace()
export class WellKnownService {
  private readonly baseUrl: string;
  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.getOrThrow('BASE_URL');
  }

  discovery(): object {
    const issuer = this.baseUrl.replace('api.', '');
    return {
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${this.baseUrl}/oauth/token`,
      userinfo_endpoint: `${this.baseUrl}/oauth/userinfo`,
      jwks_uri: `${this.baseUrl}/oauth/certs`,
      response_types_supported: ['code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['ES256'],
      scope_supported: ScopeList,
      token_endpoint_auth_methods_supported: [
        'client_secret_basic',
        'client_secret_post',
      ],
      claims_supported: [
        'sub',
        'aud',
        'exp',
        'iat',
        'iss',
        'auth_time',
        'nonce',
        ...ClientScopeList,
      ],
      grant_types_supported: [
        'authorization_code',
        'refresh_token',
        'client_credentials',
      ],
    };
  }
}
