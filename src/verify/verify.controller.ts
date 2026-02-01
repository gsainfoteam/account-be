import { ExceptionLoggerFilter } from '@lib/logger';
import {
  Body,
  Controller,
  Post,
  UseFilters,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import {
  SendEmailCodeDto,
  SendPhoneCodeDto,
  VerifyCodeDto,
  VerifyStudentIdDto,
} from './dto/req.dto';
import { VerificationJwtResDto, VerifyStudentIdResDto } from './dto/res.dto';
import { PhoneThrottlerGuard } from './guard/phoneThrottler.guard';
import { VerifyService } from './verify.service';

@ApiTags('verify')
@Controller('verify')
@UsePipes(new ValidationPipe({ transform: true }))
@UseFilters(new ExceptionLoggerFilter())
export class VerifyController {
  constructor(private readonly verifyService: VerifyService) {}

  @ApiOperation({
    summary: 'verify certification code',
    description:
      'verify the certification code. If the code is valid, return the jwt token. When verifying email, the hint should be "email", and when verifying phone number, the hint should be "phoneNumber". Subject is email address or phone number accordingly.',
  })
  @ApiResponse({
    status: 200,
    description: 'success',
    type: VerificationJwtResDto,
  })
  @ApiBadRequestResponse({
    description: 'certification code is not valid or timeout',
  })
  @ApiInternalServerErrorResponse({ description: 'server error' })
  @Post()
  async verify(@Body() body: VerifyCodeDto): Promise<VerificationJwtResDto> {
    return this.verifyService.validateCode(body);
  }

  @ApiOperation({
    summary: 'send email certification code',
    description:
      'send the email certification code to the email address. The code is valid for 5 minutes.',
  })
  @ApiResponse({ status: 201, description: 'success' })
  @ApiInternalServerErrorResponse({ description: 'server error' })
  @Post('/email')
  async sendEmailCertificationCode(
    @Body() body: SendEmailCodeDto,
  ): Promise<void> {
    await this.verifyService.sendEmailCode(body);
  }

  @ApiOperation({
    summary: 'return key for verifying student id',
    description:
      'verify student id using birth date and name for signing up and return uuid key',
  })
  @ApiOkResponse({ description: 'success', type: VerifyStudentIdResDto })
  @ApiNotFoundResponse({ description: 'Student id is not found' })
  @ApiInternalServerErrorResponse({ description: 'server error' })
  @Post('/student-id')
  async verifyStudentId(
    @Body() body: VerifyStudentIdDto,
  ): Promise<VerifyStudentIdResDto> {
    return await this.verifyService.verifyStudentId(body);
  }

  @ApiOperation({
    summary: 'send phone number certification code',
    description:
      'send the phone number certification code to the phone number. The code is valid for 5 minutes. Only South Korean phone numbers are supported.',
  })
  @ApiCreatedResponse({ description: 'success' })
  @ApiInternalServerErrorResponse({ description: 'server error' })
  @UseGuards(PhoneThrottlerGuard)
  @Post('/phone-number')
  async sendPhoneCode(@Body() body: SendPhoneCodeDto): Promise<void> {
    return await this.verifyService.sendPhoneCode(body);
  }
}
