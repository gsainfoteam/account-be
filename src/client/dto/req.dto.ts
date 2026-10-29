import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RoleType, TokenEndpointAuthMethod } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
} from 'class-validator';

import { ClientScopeList, ClientScopeType } from '../types/clientScopes.type';

export class CreateClientDto {
  @ApiProperty({
    description: 'The name of the client',
    example: 'client-1',
  })
  @IsString()
  name: string;

  @ApiPropertyOptional({
    description: 'The urls of the client',
    example: ['http://localhost:3000'],
  })
  @IsArray()
  @IsString({ each: true })
  @IsUrl(
    {
      require_valid_protocol: false,
      require_tld: false,
      require_protocol: true,
    },
    { each: true },
  )
  @IsOptional()
  urls?: string[];
}

export class UpdateClientDto {
  @ApiPropertyOptional({
    description: 'The name of the client',
    example: 'client-1',
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    description: 'The urls of the client',
    example: ['http://localhost:3000'],
  })
  @IsArray()
  @IsString({ each: true })
  @IsUrl(
    {
      require_valid_protocol: false,
      require_tld: false,
      require_protocol: true,
    },
    { each: true },
  )
  @IsOptional()
  urls?: string[];

  @ApiPropertyOptional({
    description: 'The scopes which the client uses',
    example: ['email'],
  })
  @IsArray()
  @IsString({ each: true })
  @IsIn(ClientScopeList, { each: true })
  @IsOptional()
  scopes?: ClientScopeType[];

  @ApiPropertyOptional({
    description: 'The scopes which the client might uses',
    example: ['student_id'],
  })
  @IsArray()
  @IsString({ each: true })
  @IsIn(ClientScopeList, { each: true })
  @IsOptional()
  optionalScopes?: ClientScopeType[];

  @ApiPropertyOptional({
    description: 'whether using id token or not',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  idTokenAllowed?: boolean;

  @ApiPropertyOptional({
    description:
      'how the client authenticates at the token endpoint. "none" for public clients such as browsers and apps',
    enum: TokenEndpointAuthMethod,
    example: TokenEndpointAuthMethod.client_secret_post,
  })
  @IsEnum(TokenEndpointAuthMethod)
  @IsOptional()
  tokenEndpointAuthMethod?: TokenEndpointAuthMethod;
}

export class MemberEmailDto {
  @ApiProperty({ example: 'student@gist.ac.kr' })
  @IsEmail()
  email!: string;
}

export class ClientMemberParamsDto {
  @ApiProperty({ description: 'id of the client' })
  @IsUUID()
  clientId!: string;

  @ApiProperty({ description: 'id of the user' })
  @IsUUID()
  userId!: string;
}

export class ClientRoleDto {
  @ApiProperty({
    description: 'Setting a role in the client',
    example: 'ADMIN',
    enum: RoleType,
  })
  @IsEnum(RoleType)
  role: RoleType;
}
