import { LoggerModule } from '@lib/logger';
import { MailModule } from '@lib/mail';
import { RedisModule } from '@lib/redis';
import { SmsModule } from '@lib/sms';
import { TemplatesModule } from '@lib/templates';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { VerifyController } from './verify.controller';
import { VerifyService } from './verify.service';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    MailModule,
    RedisModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('VERIFICATION_JWT_SECRET'),
        signOptions: {
          expiresIn: configService.getOrThrow<string>(
            'VERIFICATION_JWT_EXPIRE',
          ),
          algorithm: 'HS256',
        },
      }),
    }),
    SmsModule,
    TemplatesModule,
  ],
  controllers: [VerifyController],
  providers: [VerifyService],
  exports: [VerifyService],
})
export class VerifyModule {}
