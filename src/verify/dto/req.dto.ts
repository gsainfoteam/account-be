import { IsGistEmail } from '@lib/global';
import { BadRequestException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString } from 'class-validator';

import {
  VerificationCodeList,
  VerificationCodeType,
} from '../types/verification.type';

export class SendEmailCodeDto {
  @ApiProperty({
    example: 'JohnDoe@gm.gist.ac.kr',
    description: 'GIST 이메일',
    required: true,
  })
  @IsEmail()
  @IsGistEmail({ message: 'GIST 이메일을 입력해주세요.' })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.toLowerCase();
    }
    throw new BadRequestException('이메일 형식이 올바르지 않습니다.');
  })
  email: string;
}

export class VerifyCodeDto {
  @ApiProperty({
    example: 'JohnDoe@gm.gist.ac.kr or +82 10 1234 5678',
    description: 'GIST 이메일, 전화번호 혹은 다른 인증 대상의 대푯값',
    required: true,
  })
  @IsString()
  subject: string;

  @ApiProperty({
    example: 'verification-code',
    description: '인증 코드',
    required: true,
  })
  @IsString()
  code: string;

  @ApiProperty({
    example: 'email or phoneNumber',
    description: '인증 타입 (email 또는 phoneNumber)',
    required: true,
    enum: VerificationCodeList,
  })
  @IsString()
  hint: VerificationCodeType;
}

export class VerifyStudentIdDto {
  @ApiPropertyOptional({ description: 'first name (외국인용)' })
  @IsString()
  firstName?: string;

  @ApiProperty({ description: '이름' })
  @IsString()
  name: string;

  @ApiProperty({ example: '20000101', description: '생년월일' })
  @IsString()
  birthDate: string;
}

export class SendPhoneCodeDto {
  @ApiProperty({
    example: '+82 10 1234 5678',
    description: '전화번호',
  })
  @IsString()
  phoneNumber: string;
}
