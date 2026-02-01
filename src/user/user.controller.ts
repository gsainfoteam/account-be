import { ExceptionLoggerFilter } from '@lib/logger';
import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseFilters,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { User } from '@prisma/client';
import { GetUser } from 'src/auth/decorator/getUser.decorator';
import { UserGuard } from 'src/auth/guard/auth.guard';
import { VerifyStudentIdDto } from 'src/verify/dto/req.dto';

import {
  ChangePasskeyNameDto,
  ChangePasswordDto,
  DeleteUserReqDto,
  IssueUserSecretDto,
  RegisterDto,
  VerifyPasskeyRegistrationDto,
  VerifyPhoneNumberDto,
} from './dto/req.dto';
import {
  BasicPasskeyDto,
  PasskeyRegisterOptionResDto,
  UpdateUserPictureResDto,
  UserConsentListResDto,
  UserConsentResDto,
  UserResDto,
} from './dto/res.dto';
import { UserService } from './user.service';

@ApiTags('user')
@Controller('user')
@UsePipes(new ValidationPipe({ transform: true }))
@UseInterceptors(ClassSerializerInterceptor)
@UseFilters(new ExceptionLoggerFilter())
export class UserController {
  constructor(private readonly userService: UserService) {}

  @ApiOperation({
    summary: 'get user',
    description: 'api for getting user',
  })
  @ApiBearerAuth('user:jwt')
  @ApiOkResponse({ description: 'success', type: UserResDto })
  @ApiUnauthorizedResponse({ description: 'token not valid' })
  @ApiInternalServerErrorResponse({ description: 'server error' })
  @UseGuards(UserGuard)
  @Get()
  getUser(@GetUser() user: User): UserResDto {
    return new UserResDto(user);
  }

  @ApiOperation({
    summary: 'get user consent',
    description: 'api for getting user consent',
  })
  @ApiBearerAuth('user:jwt')
  @ApiOkResponse({ description: 'success', type: UserConsentListResDto })
  @ApiUnauthorizedResponse({ description: 'token not valid' })
  @ApiInternalServerErrorResponse({ description: 'server error' })
  @UseGuards(UserGuard)
  @Get('/consent')
  async getUserConsent(@GetUser() user: User): Promise<UserConsentListResDto> {
    return {
      list: (await this.userService.findUserConsentByUuid(user)).map(
        (userConsent) => {
          return new UserConsentResDto(userConsent);
        },
      ),
    };
  }

  @ApiOperation({
    summary: 'check existing email',
    description: 'api for checking existing email',
  })
  @ApiOkResponse({ description: 'success', type: Boolean })
  @ApiInternalServerErrorResponse({ description: 'server error' })
  @Get('/email/:email')
  async checkEmail(@Param('email') email: string): Promise<boolean> {
    return await this.userService.checkEmail(email);
  }

  @ApiOperation({
    summary: 'sign up',
    description:
      'API for user sign up. Email verification JWT is always required. Phone number verification JWT is required only for Korean (KR) phone numbers. Student ID verification JWT is required for student emails (@gm.gist.ac.kr).',
  })
  @ApiCreatedResponse({ description: 'success' })
  @ApiBadRequestResponse({ description: 'invalid phone number format' })
  @ApiConflictResponse({ description: 'user already exists' })
  @ApiForbiddenResponse({ description: 'certification token is not valid' })
  @ApiInternalServerErrorResponse({ description: 'server error' })
  @Post()
  async register(@Body() body: RegisterDto): Promise<void> {
    return this.userService.register(body);
  }

  @ApiOperation({
    summary: 'verify student id for original user',
    description:
      'verify student id using birth date and name for original user. If not error, it represents a successful save.',
  })
  @ApiBearerAuth('user:jwt')
  @ApiOkResponse({ description: 'success' })
  @ApiNotFoundResponse({ description: 'user is not found' })
  @ApiInternalServerErrorResponse({ description: 'server error' })
  @UseGuards(UserGuard)
  @Post('/verify/student-id')
  async verifyStudentId(
    @GetUser() user: User,
    @Body() body: VerifyStudentIdDto,
  ): Promise<void> {
    return await this.userService.verifyStudentId(user.uuid, body);
  }

  @ApiOperation({
    summary: 'verify phone number for original user',
    description:
      'verify phone number using phone number and verification code for original user. If not error, it represents a successful save.',
  })
  @ApiBearerAuth('user:jwt')
  @ApiOkResponse({ description: 'success' })
  @ApiNotFoundResponse({ description: 'user is not found' })
  @ApiInternalServerErrorResponse({ description: 'server error' })
  @UseGuards(UserGuard)
  @Post('/verify/phone-number')
  async verifyPhoneNumber(
    @GetUser() user: User,
    @Body() body: VerifyPhoneNumberDto,
  ): Promise<void> {
    return await this.userService.verifyPhoneNumber(user.uuid, body);
  }

  @ApiOperation({
    summary: 'issue password',
    description: 'api for issuing new password through email',
  })
  @ApiCreatedResponse({ description: 'success' })
  @ApiBadRequestResponse({ description: 'body form is not valid' })
  @ApiForbiddenResponse({
    description: 'email is not valid, or user not found',
  })
  @ApiInternalServerErrorResponse({ description: 'server error' })
  @Post('/password')
  async issuePassword(@Body() body: IssueUserSecretDto): Promise<void> {
    return this.userService.issuePassword(body);
  }

  @ApiOperation({
    summary: 'change password',
    description: 'api for changing password',
  })
  @ApiOkResponse({ description: 'success' })
  @ApiBadRequestResponse({ description: 'body form is not valid' })
  @ApiUnauthorizedResponse({ description: 'token not valid' })
  @ApiForbiddenResponse({
    description: 'oldPassword not valid, or access token and user not match',
  })
  @ApiInternalServerErrorResponse({ description: 'server error' })
  @UseGuards(UserGuard)
  @Patch('/password')
  async changePassword(
    @Body() body: ChangePasswordDto,
    @GetUser() user: User,
  ): Promise<void> {
    return this.userService.changePassword(body, user);
  }

  @ApiOperation({
    summary: 'update picture',
    description:
      'api for updating profile image. it will return updated profile presigned url. image format must be webp',
  })
  @ApiBearerAuth('user:jwt')
  @ApiOkResponse({ description: 'success', type: UpdateUserPictureResDto })
  @ApiUnauthorizedResponse({ description: 'token not valid' })
  @ApiInternalServerErrorResponse({ description: 'server error' })
  @UseGuards(UserGuard)
  @Patch('/picture')
  async updatePicture(
    @Query('length', ParseIntPipe) length: number,
    @GetUser() user: User,
  ): Promise<UpdateUserPictureResDto> {
    return this.userService.updateUserPicture(length, user.uuid);
  }

  @ApiOperation({
    summary: 'delete user',
    description: 'api for deleting user',
  })
  @ApiBearerAuth('user:jwt')
  @ApiOkResponse({ description: 'success' })
  @ApiForbiddenResponse({ description: 'password is not valid' })
  @ApiInternalServerErrorResponse({ description: 'server error' })
  @UseGuards(UserGuard)
  @Delete()
  async deleteUser(
    @GetUser() user: User,
    @Body() body: DeleteUserReqDto,
  ): Promise<void> {
    return this.userService.deleteUser(user.uuid, body);
  }

  @ApiOperation({
    summary: 'delete user picture',
    description: 'api for deleting user profile image',
  })
  @ApiBearerAuth('user:jwt')
  @ApiOkResponse({ description: 'success' })
  @ApiUnauthorizedResponse({ description: 'token not valid' })
  @ApiInternalServerErrorResponse({ description: 'server error' })
  @UseGuards(UserGuard)
  @Delete('/picture')
  async deletePicture(@GetUser() user: User): Promise<void> {
    return this.userService.deleteUserPicture(user.uuid);
  }

  @ApiOperation({
    summary: 'get the passkey list of user',
    description: '사용자의 패스키 목록을 불러옵니다',
  })
  @ApiBearerAuth('user:jwt')
  @ApiOkResponse({
    description: 'success',
    type: [BasicPasskeyDto],
  })
  @ApiUnauthorizedResponse({ description: 'token not valid' })
  @ApiInternalServerErrorResponse({ description: 'server error' })
  @UseGuards(UserGuard)
  @Get('passkey')
  async getPasskeyList(@GetUser() user: User): Promise<BasicPasskeyDto[]> {
    return await this.userService.getPasskeyList(user.uuid);
  }

  @ApiOperation({
    summary: 'register the passkey',
    description: '패스키를 등록을 위한 challenge를 발급합니다.',
  })
  @ApiBearerAuth('user:jwt')
  @ApiOkResponse({
    description: 'success',
    type: PasskeyRegisterOptionResDto,
  })
  @ApiUnauthorizedResponse({ description: 'token not valid' })
  @ApiNotFoundResponse({ description: 'Email is not found' })
  @ApiInternalServerErrorResponse({ description: 'server error' })
  @UseGuards(UserGuard)
  @Post('passkey')
  async registerOptions(
    @GetUser() user: User,
  ): Promise<PasskeyRegisterOptionResDto> {
    return await this.userService.registerOptions(user.email);
  }

  @ApiOperation({
    summary: 'verify the registration options',
    description: '패스키 등록합니다.',
  })
  @ApiBearerAuth('user:jwt')
  @ApiOkResponse({ description: 'success', type: Boolean })
  @ApiUnauthorizedResponse({ description: 'token not valid' })
  @ApiNotFoundResponse({ description: 'Email is not found' })
  @ApiConflictResponse({ description: 'Credential id conflict' })
  @ApiInternalServerErrorResponse({ description: 'server error' })
  @UseGuards(UserGuard)
  @Post('passkey/verify')
  async verifyRegistration(
    @GetUser() user: User,
    @Body() { name, icon, registrationResponse }: VerifyPasskeyRegistrationDto,
  ): Promise<boolean> {
    return await this.userService.verifyRegistration(
      user.email,
      name,
      registrationResponse,
      icon,
    );
  }

  @ApiOperation({
    summary: 'update name of passkey',
    description: '패스키의 이름을 수정합니다.',
  })
  @ApiBearerAuth('user:jwt')
  @ApiOkResponse({ description: 'success' })
  @ApiUnauthorizedResponse({ description: 'token not valid' })
  @ApiForbiddenResponse({ description: 'Invalid user or token' })
  @ApiNotFoundResponse({ description: 'Id is not found' })
  @ApiInternalServerErrorResponse({ description: 'server error' })
  @UseGuards(UserGuard)
  @Patch('passkey/:id')
  async updatePasskey(
    @GetUser() user: User,
    @Param('id') id: string,
    @Body() { name }: ChangePasskeyNameDto,
  ): Promise<void> {
    return await this.userService.updatePasskey(id, name, user.uuid);
  }

  @ApiOperation({
    summary: 'delete passkey',
    description: '패스키를 삭제합니다.',
  })
  @ApiBearerAuth('user:jwt')
  @ApiOkResponse({ description: 'success' })
  @ApiUnauthorizedResponse({ description: 'token not valid' })
  @ApiForbiddenResponse({ description: 'Invalid user or token' })
  @ApiNotFoundResponse({ description: 'Id is not found' })
  @ApiInternalServerErrorResponse({ description: 'server error' })
  @UseGuards(UserGuard)
  @Delete('passkey/:id')
  async deletePasskey(
    @GetUser() user: User,
    @Param('id') id: string,
  ): Promise<void> {
    return await this.userService.deletePasskey(id, user.uuid);
  }
}
