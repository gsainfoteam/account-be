import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ClientScopeList } from 'src/client/types/clientScopes.type';

import { OauthAuthorizeException } from '../exceptions/oauth.authorize.exception';
import { OauthTokenException } from '../exceptions/oauth.token.exception';
import {
  CodeChallengeMethod,
  CodeChallengeMethodList,
} from '../types/codeChallengeMethod.type';
import { GrantType, GrantTypeList } from '../types/grant.type';
import { ScopeList, ScopeType } from '../types/scope.type';

export class ConsentReqDto {
  @ApiProperty({
    description: 'scope that the user agrees to use',
    type: String,
  })
  @Transform(({ value }) => {
    if (typeof value === 'string')
      return value.split(' ').filter((v) => v !== '').map((v) => {
        if (ClientScopeList.includes(v)) return v;
        throw new OauthAuthorizeException('invalid_scope');
      });
    throw new OauthAuthorizeException('invalid_scope');
  })
  @IsString({ each: true })
  @IsArray()
  scope: ScopeType[];

  @ApiProperty({
    description: 'id of the client',
    name: 'client_id',
  })
  @Expose({
    name: 'client_id',
  })
  @IsString()
  clientId: string;
}
export class AuthorizationReqDto {
  @ApiProperty({
    description:
      'response type of authorization since we use oauth2.1, only "code" is supported',
    name: 'response_type',
  })
  @Expose({
    name: 'response_type',
  })
  @IsString()
  @Transform(({ value }) => {
    if (value === 'code') return value as string;
    throw new OauthAuthorizeException('unsupported_response_type');
  })
  responseType: string;

  @ApiProperty({
    description: 'client_id of the client',
    name: 'client_id',
  })
  @Expose({
    name: 'client_id',
  })
  @IsString()
  clientId: string;

  @ApiProperty({
    description:
      'code_challenge, since we use PKCE, you should provide this pair',
    name: 'code_challenge',
  })
  @Expose({
    name: 'code_challenge',
  })
  @IsString()
  codeChallenge: string;

  @ApiProperty({
    description:
      'code_challenge_method, only support "plain" or "S256" for PKCE',
    type: 'string',
    name: 'code_challenge_method',
    enum: CodeChallengeMethodList,
  })
  @Expose({
    name: 'code_challenge_method',
  })
  @IsString()
  @IsIn(CodeChallengeMethodList)
  codeChallengeMethod: CodeChallengeMethod;

  @ApiProperty({
    description: 'redirect_uri of the client',
    name: 'redirect_uri',
  })
  @Expose({
    name: 'redirect_uri',
  })
  @IsString()
  redirectUri: string;

  @ApiProperty({
    description: 'scope of the client',
  })
  @Transform(({ value }) => {
    if (typeof value === 'string')
      return value.split(' ').map((v) => {
        if (ScopeList.includes(v)) return v;
        throw new OauthAuthorizeException('invalid_scope');
      });
    throw new OauthAuthorizeException('invalid_scope');
  })
  @IsString({ each: true })
  @IsArray()
  scope: ScopeType[];

  @ApiPropertyOptional({
    description: 'state of the client',
  })
  @IsString()
  @IsOptional()
  state?: string;

  @ApiPropertyOptional({
    description: 'nonce of the client',
  })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  nonce?: string;
}

export class TokenReqDto {
  @ApiProperty({
    description:
      'grant type of the client, only support "authorization_code", ""client_credentials", "refresh_token"',
    name: 'grant_type',
  })
  @Expose({
    name: 'grant_type',
  })
  @IsString()
  @Transform(({ value }) => {
    if (GrantTypeList.includes(value as string)) return value as GrantType;
    throw new OauthTokenException('unsupported_grant_type');
  })
  grantType: GrantType;

  @ApiPropertyOptional({
    description: 'client_id of the client',
    name: 'client_id',
    required: false,
  })
  @Expose({
    name: 'client_id',
  })
  @IsString()
  @IsOptional()
  clientId?: string;

  @ApiPropertyOptional({
    description: 'client_secret of the client',
    name: 'client_secret',
    required: false,
  })
  @Expose({
    name: 'client_secret',
  })
  @IsString()
  @IsOptional()
  clientSecret?: string;

  @ApiPropertyOptional({
    description: 'code of the client',
    required: false,
  })
  @IsString()
  @IsOptional()
  code?: string;

  @ApiPropertyOptional({
    description:
      'code_verifier of the client, this is required when using PKCE, you should make it when you provide code_challenge',
    name: 'code_verifier',
    required: false,
  })
  @Expose({
    name: 'code_verifier',
  })
  @IsString()
  @IsOptional()
  codeVerifier?: string;

  @ApiPropertyOptional({
    description: 'refresh_token of the client',
    name: 'refresh_token',
    required: false,
  })
  @Expose({
    name: 'refresh_token',
  })
  @IsString()
  @IsOptional()
  refreshToken?: string;

  @ApiPropertyOptional({
    description: 'scope of the client',
  })
  @Transform(({ value }) => {
    if (typeof value === 'string')
      return value.split(' ').map((v) => {
        if (ScopeList.includes(v)) return v;
        throw new OauthTokenException('invalid_scope');
      });
    throw new OauthTokenException('invalid_scope');
  })
  @IsString({ each: true })
  @IsArray()
  @IsOptional()
  scope?: ScopeType[];
}

export class RevokeReqDto {
  @ApiProperty({
    description: 'token to revoke',
  })
  @IsString()
  token: string;

  @ApiPropertyOptional({
    description: 'token type hint',
    name: 'token_type_hint',
  })
  @Expose({
    name: 'token_type_hint',
  })
  @IsString()
  @IsIn(['access_token', 'refresh_token'])
  @IsOptional()
  tokenTypeHint?: 'access_token' | 'refresh_token';
}
