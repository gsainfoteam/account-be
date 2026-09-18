import { OtelClassSerializerInterceptor } from '@gsainfoteam/nest-observability';
import { ExceptionLoggerFilter } from '@lib/logger';
import {
  Body,
  Controller,
  Delete,
  Post,
  Req,
  Res,
  UseFilters,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { FastifyReply, FastifyRequest } from 'fastify';

import { AuthService } from './auth.service';
import { LoginDto, VerifyPasskeyAuthenticationDto } from './dto/req.dto';
import { LoginResDto, PasskeyAuthOptionResDto } from './dto/res.dto';

@ApiTags('auth')
@Controller('auth')
@UsePipes(ValidationPipe)
@UseInterceptors(OtelClassSerializerInterceptor)
@UseFilters(new ExceptionLoggerFilter())
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({
    summary: 'login',
    description:
      '로그인을 수행합니다. 이때, refreshToken은 cookie로 전달됩니다.',
  })
  @ApiCreatedResponse({ description: '성공', type: LoginResDto })
  @ApiUnauthorizedResponse({ description: '로그인 실패' })
  @ApiInternalServerErrorResponse({ description: '서버 에러' })
  @Post('login')
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) response: FastifyReply,
  ): Promise<LoginResDto> {
    const {
      refreshToken,
      accessToken,
      refreshTokenExpireTime,
      accessTokenExpireTime,
    } = await this.authService.login(loginDto);
    response.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      expires: new Date(Date.now() + accessTokenExpireTime),
      path: '/',
    });
    response.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      expires: new Date(Date.now() + refreshTokenExpireTime),
      path: '/auth',
    });
    return {
      accessToken,
    };
  }

  @ApiOperation({ summary: 'logout' })
  @ApiOkResponse({ description: '로그아웃 성공' })
  @ApiInternalServerErrorResponse({ description: '서버 에러' })
  @Delete('logout')
  async logout(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) response: FastifyReply,
  ): Promise<void> {
    await this.authService.logout(request.cookies.refreshToken ?? '');
    response.clearCookie('accessToken', {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
    });
    response.clearCookie('refreshToken', {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/auth',
    });
  }

  @ApiOperation({
    summary: 'refresh access token',
    description:
      '액세스 토큰을 갱신합니다. 이때, refreshToken은 cookie로 전달됩니다.',
  })
  @ApiCreatedResponse({ description: '성공', type: LoginResDto })
  @ApiUnauthorizedResponse({ description: '유효하지 않은 refreshToken' })
  @ApiInternalServerErrorResponse({ description: '서버 에러' })
  @Post('refresh')
  async refresh(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) response: FastifyReply,
  ): Promise<LoginResDto> {
    const {
      refreshToken: newRefreshToken,
      accessToken,
      refreshTokenExpireTime,
      accessTokenExpireTime,
    } = await this.authService.refresh(request.cookies.refreshToken ?? '');
    response.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      expires: new Date(Date.now() + accessTokenExpireTime),
      path: '/',
    });
    response.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      expires: new Date(Date.now() + refreshTokenExpireTime),
      path: '/auth',
    });
    return {
      accessToken,
    };
  }

  @ApiOperation({
    summary: 'get the passkey options',
    description: '패스키 로그인을 위한 정보를 불러옵니다.',
  })
  @ApiOkResponse({
    description: 'success',
    type: PasskeyAuthOptionResDto,
  })
  @ApiNotFoundResponse({ description: 'Email is not found' })
  @ApiInternalServerErrorResponse({ description: 'server error' })
  @Post('passkey')
  async authenticateOptions(): Promise<PasskeyAuthOptionResDto> {
    return this.authService.authenticateOptions();
  }

  @ApiOperation({
    summary: 'verify the passkey options',
    description: '패스키를 인증합니다.',
  })
  @ApiCreatedResponse({ description: 'success', type: LoginResDto })
  @ApiUnauthorizedResponse({ description: 'Response is invalid' })
  @ApiNotFoundResponse({ description: 'Email is not found' })
  @ApiInternalServerErrorResponse({ description: 'server error' })
  @Post('passkey/verify')
  async verifyAuthentication(
    @Body() { key, authenticationResponse }: VerifyPasskeyAuthenticationDto,
    @Res({ passthrough: true }) response: FastifyReply,
  ): Promise<LoginResDto> {
    const {
      refreshToken,
      accessToken,
      refreshTokenExpireTime,
      accessTokenExpireTime,
    } = await this.authService.verifyAuthentication(
      key,
      authenticationResponse,
    );
    response.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      expires: new Date(Date.now() + accessTokenExpireTime),
      path: '/',
    });
    response.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      expires: new Date(Date.now() + refreshTokenExpireTime),
      path: '/auth',
    });
    return {
      accessToken,
    };
  }
}
