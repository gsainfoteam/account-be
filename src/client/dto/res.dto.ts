import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Client, RoleType, TokenEndpointAuthMethod } from '@prisma/client';
import { Exclude, Expose } from 'class-transformer';

export class ClientResDto implements Client {
  @ApiProperty({
    description: 'The UUID of the client',
    example: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
  })
  @Expose()
  get clientId(): string {
    return this.uuid;
  }

  @ApiProperty({
    description: 'The name of the client',
    example: 'client name',
  })
  name: string;

  @ApiProperty({
    description: 'The urls of the client',
    example: ['https://example.com'],
  })
  @ApiProperty()
  urls: string[];

  @ApiProperty({
    description: 'The picture urls of the client',
    example: 'https://example.com',
    type: 'string',
    nullable: true,
  })
  picture: string | null;

  @ApiProperty({
    description: 'The date the client was created',
    example: '2021-07-01T00:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'The date the client was last updated',
    example: '2021-07-01T00:00:00.000Z',
  })
  updatedAt: Date;

  @ApiProperty({
    description: "the scope which need to use the client's service",
    example: ['profile', 'email'],
  })
  scopes: string[];

  @ApiProperty({
    description: "the scope whether need or not in the client's service",
    example: ['student_id'],
  })
  optionalScopes: string[];

  @ApiProperty({
    description: 'whether the client has authority to use id token or not',
    example: true,
  })
  idTokenAllowed: boolean;

  @ApiProperty({
    description:
      'how the client authenticates at the token endpoint. "none" for public clients such as browsers and apps',
    enum: TokenEndpointAuthMethod,
    example: TokenEndpointAuthMethod.none,
  })
  tokenEndpointAuthMethod: TokenEndpointAuthMethod;

  @ApiProperty({
    description: 'The date the client requested to be deleted',
    example: '2021-07-01T00:00:00.000Z',
    nullable: true,
    type: Date,
  })
  deleteRequestedAt: Date | null;

  @Exclude()
  secret: string;

  @Exclude()
  uuid: string;

  constructor(client: Client) {
    Object.assign(this, client);
  }
}

export class ClientPublicResDto implements Client {
  @ApiProperty({
    description: 'The UUID of the client',
    example: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
  })
  @Expose()
  get clientId(): string {
    return this.uuid;
  }

  @ApiProperty({
    description: 'The name of the client',
    example: 'groups',
  })
  name: string;

  @ApiProperty({
    description: 'The picture urls of the client',
    example: 'https://example.com',
    type: 'string',
    nullable: true,
  })
  picture: string | null;

  @ApiProperty({
    description: 'The date the client was created',
    example: '2021-07-01T00:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: "The scope which need to use the client's service",
    example: ['profile', 'email'],
  })
  scopes: string[];

  @ApiProperty({
    description: "The scope whether need or not in the client's service",
    example: ['student_id'],
  })
  optionalScopes: string[];

  @Exclude()
  uuid: string;

  @Exclude()
  secret: string;

  @Exclude()
  urls: string[];

  @Exclude()
  updatedAt: Date;

  @Exclude()
  idTokenAllowed: boolean;

  @ApiProperty({
    description: 'how the client authenticates at the token endpoint',
    enum: TokenEndpointAuthMethod,
    example: TokenEndpointAuthMethod.client_secret_post,
  })
  tokenEndpointAuthMethod: TokenEndpointAuthMethod;

  @Exclude()
  deleteRequestedAt: Date | null;

  constructor(client: Client) {
    Object.assign(this, client);
  }
}

export class ClientCredentialResDto implements Client {
  @ApiProperty({
    description: 'Client id',
    example: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
  })
  @Expose()
  get clientId(): string {
    return this.uuid;
  }

  @ApiProperty({
    description: 'Client Secret',
    example: 'client-secret',
  })
  @Expose()
  get clientSecret(): string {
    return this.secret;
  }

  @Exclude()
  name: string;

  @Exclude()
  uuid: string;

  @Exclude()
  picture: string | null;

  @Exclude()
  secret: string;

  @Exclude()
  urls: string[];

  @Exclude()
  createdAt: Date;

  @Exclude()
  updatedAt: Date;

  @Exclude()
  idTokenAllowed: boolean;

  @Exclude()
  tokenEndpointAuthMethod: TokenEndpointAuthMethod;

  @Exclude()
  scopes: string[];

  @Exclude()
  optionalScopes: string[];

  @Exclude()
  deleteRequestedAt: Date | null;

  constructor(client: Client) {
    Object.assign(this, client);
  }
}

class RoleDto {
  @ApiProperty({
    description: 'Role name',
    example: 'ADMIN',
    enum: RoleType,
  })
  role: RoleType;
}

export class ClientMembersResDto {
  @ApiProperty({
    description: 'Member UUID',
    example: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
  })
  uuid: string;

  @ApiProperty({
    description: 'Member name',
    example: 'John Doe',
  })
  name: string;

  @ApiProperty({
    description: 'Member email',
    example: 'email@gm.gist.ac.kr',
  })
  email: string;

  @ApiPropertyOptional({
    description: 'Member picture url',
    example: 'https://example.com/profile.png',
    type: String,
    nullable: true,
  })
  picture: string | null;

  @ApiProperty({
    description: 'Member roles in the client',
    type: [RoleDto],
  })
  memberships: RoleDto[];
}

export class UpdateClientPictureResDto {
  @ApiProperty({
    description: 'presigned url for client picture',
    example: 'https://example.com/client-picture.png',
  })
  presignedUrl: string;
}
