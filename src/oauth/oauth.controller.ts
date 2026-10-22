import { OtelClassSerializerInterceptor } from '@gsainfoteam/nest-observability';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpRedirectResponse,
  HttpStatus,
  Post,
  Query,
  Redirect,
  SerializeOptions,
  UnauthorizedException,
  UseFilters,
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
  AuthorizeErrorReqDto,
  ConsentReqDto,
  LogoutRedirectReqDto,
  RevokeReqDto,
  TokenReqDto,
} from './dto/req.dto';
import { TokenResDto, UserInfoResDto } from './dto/res.dto';
import {
  OauthAuthorizeExceptionFilter,
  UNTRUSTED_REDIRECT,
} from './filters/oauthAuthorize.filter';
import { OauthTokenExceptionFilter } from './filters/oauthToken.filter';
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
  @UseFilters(OauthAuthorizeExceptionFilter)
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
    summary: 'report an authorize error to the client',
    description:
      'account-fe sends the user here when it turns an authorize request away. the error is redirected to redirect_uri only when it is registered for the client.',
  })
  @ApiBadRequestResponse({
    description: 'unknown client_id or unregistered redirect_uri',
  })
  @Redirect()
  @Get('authorize/error')
  async authorizeError(
    @Query() query: AuthorizeErrorReqDto,
  ): Promise<HttpRedirectResponse> {
    const url = await this.oauthService.authorizeErrorRedirect(query);
    if (!url) throw new BadRequestException(UNTRUSTED_REDIRECT);

    return { url, statusCode: 302 };
  }

  @ApiOperation({
    summary: 'return to the client after logout',
    description:
      'account-fe sends the user here after it ended the IdP session for an RP-Initiated Logout request. the user is redirected to post_logout_redirect_uri only when it is registered for the client.',
  })
  @ApiBadRequestResponse({
    description: 'unknown client_id or unregistered post_logout_redirect_uri',
  })
  @Redirect()
  @Get('logout/redirect')
  async logoutRedirect(
    @Query() query: LogoutRedirectReqDto,
  ): Promise<HttpRedirectResponse> {
    const url = await this.oauthService.logoutRedirect(query);
    if (!url) throw new BadRequestException(UNTRUSTED_REDIRECT);

    return { url, statusCode: 302 };
  }

  @ApiOperation({
    summary: 'get the token',
    description:
      'get the token from the authorization code. through this endpoint, the client can get the token from the authorization code, refresh token. or client credential.',
  })
  @ApiConsumes('application/x-www-form-urlencoded', 'application/json')
  @ApiBadRequestResponse({ description: 'invalid request' })
  @UseGuards(BasicAuthGuard)
  @UseFilters(OauthTokenExceptionFilter)
  @Post('token')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @SerializeOptions({ type: TokenResDto })
  token(@Body() body: TokenReqDto): Promise<TokenResDto> {
    return this.oauthService.token(body as GrantContentType);
  }

  @ApiOperation({
    summary: 'revoke the token (deprecated)',
    description:
      'use POST /oauth/revoke instead. kept with its original behavior so existing callers keep working until they move to the RFC 7009 endpoint.',
    deprecated: true,
  })
  @Delete('token')
  @Header('Deprecation', '@1791558000')
  @Header('Link', '</oauth/revoke>; rel="successor-version"')
  async revokeDeprecated(@Body() body: RevokeReqDto): Promise<void> {
    return this.oauthService.revokeDeprecated(body);
  }

  @ApiOperation({
    summary: 'revoke a token (RFC 7009)',
    description:
      'revoke an access or refresh token issued to the client. responds with 200 even for unknown tokens.',
  })
  @ApiConsumes('application/x-www-form-urlencoded', 'application/json')
  @UseGuards(BasicAuthGuard)
  @UseFilters(OauthTokenExceptionFilter)
  @Post('revoke')
  @HttpCode(HttpStatus.OK)
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
    @Headers('Authorization') authorizationHeader: string | undefined,
    @Query('sub') sub?: string,
  ): Promise<UserInfoResDto> {
    const [type, token] = (authorizationHeader ?? '').split(' ');
    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException();
    }
    return this.oauthService.userinfo(token, sub);
  }
}
