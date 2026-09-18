import { OtelClassSerializerInterceptor } from '@gsainfoteam/nest-observability';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpRedirectResponse,
  HttpStatus,
  Post,
  Query,
  Redirect,
  SerializeOptions,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOperation,
  ApiPermanentRedirectResponse,
  ApiTags,
} from '@nestjs/swagger';
import { User } from '@prisma/client';
import { GetUser } from 'src/auth/decorator/getUser.decorator';
import { UserGuard } from 'src/auth/guard/auth.guard';

import {
  AuthorizationReqDto,
  ConsentReqDto,
  RevokeReqDto,
  TokenReqDto,
} from './dto/req.dto';
import { TokenResDto, UserInfoResDto } from './dto/res.dto';
import { BasicAuthGuard } from './guards/basicAuth.guard';
import { OauthService } from './oauth.service';
import { GrantContentType } from './types/grant.type';

@ApiTags('oauth')
@Controller('oauth')
@UsePipes(new ValidationPipe({ transform: true }))
@UseInterceptors(OtelClassSerializerInterceptor)
export class OauthController {
  constructor(private readonly oauthService: OauthService) {}

  @ApiOperation({
    summary: 'get the certs',
    description:
      'get the public key to verify the jwt token. through this endpoint, the client can get the public key to verify the jwt token.',
  })
  @Get('certs')
  certs() {
    return this.oauthService.certs();
  }

  @ApiOperation({
    summary: 'consent to the client',
    description:
      'make the user consent to the client. through this endpoint, the user can agree to use the client. if not agreed, the client cannot get the user information.',
  })
  @ApiBearerAuth('user:jwt')
  @ApiConsumes('application/x-www-form-urlencoded', 'application/json')
  @ApiCreatedResponse({ description: 'consent success' })
  @Post('consent')
  @UseGuards(UserGuard)
  async consent(
    @Body() body: ConsentReqDto,
    @GetUser() user: User,
  ): Promise<void> {
    return this.oauthService.consent(body, user);
  }

  @ApiOperation({
    summary: 'authorize the client',
    description:
      'authorize the client to get the code. through this endpoint, the user can authorize the client to get the code.',
  })
  @ApiBearerAuth('user:jwt')
  @ApiPermanentRedirectResponse({
    description:
      'it move to client uri with certain query parameters, ex) https://client.com/callback?code=123&state=123&iss=https://auth-server.com',
  })
  @ApiBadRequestResponse({ description: 'invalid request' })
  @Redirect()
  @Get('authorize')
  @UseGuards(UserGuard)
  async authorize(
    @Query() query: AuthorizationReqDto,
    @GetUser() user: User,
  ): Promise<HttpRedirectResponse> {
    return {
      url: await this.oauthService.authorize(query, user),
      statusCode: 302,
    };
  }

  @ApiOperation({
    summary: 'get the token',
    description:
      'get the token from the authorization code. through this endpoint, the client can get the token from the authorization code, refresh token. or client credential.',
  })
  @ApiConsumes('application/x-www-form-urlencoded', 'application/json')
  @ApiBadRequestResponse({ description: 'invalid request' })
  @UseGuards(BasicAuthGuard)
  @Post('token')
  @HttpCode(HttpStatus.OK)
  @SerializeOptions({ type: TokenResDto })
  token(@Body() body: TokenReqDto): Promise<TokenResDto> {
    return this.oauthService.token(body as GrantContentType);
  }

  @ApiOperation({
    summary: 'revoke the token',
    description:
      'revoke the token from the client. through this endpoint, the client can revoke the token.',
  })
  @Delete('token')
  async revoke(@Body() body: RevokeReqDto): Promise<void> {
    return this.oauthService.revoke(body);
  }

  @ApiOperation({
    summary: 'get the userinfo',
    description:
      'get the user information from the token. through this endpoint, the client can get the user information from the token.',
  })
  @Get('userinfo')
  @SerializeOptions({ type: UserInfoResDto })
  async userinfo(
    @Headers('Authorization') authorizationHeader: string,
    @Query('sub') sub?: string,
  ): Promise<UserInfoResDto> {
    const [type, token] = authorizationHeader.split(' ');
    if (type !== 'Bearer') {
      throw new BadRequestException('invalid token type');
    }
    return this.oauthService.userinfo(token, sub);
  }
}
