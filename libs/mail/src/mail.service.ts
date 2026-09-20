import { Trace } from '@gsainfoteam/nest-observability';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';

@Injectable()
@Trace()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;
  constructor(private readonly configService: ConfigService) {
    this.transporter = createTransport({
      host: this.configService.getOrThrow<string>('EMAIL_HOST'),
      port: this.configService.getOrThrow<number>('EMAIL_PORT'),
      secure: true,
      auth: {
        type: 'oauth2',
        user: this.configService.getOrThrow<string>('EMAIL_USER'),
        serviceClient: this.configService.getOrThrow<string>(
          'EMAIL_SERVICE_CLIENT',
        ),
        privateKey: this.configService
          .getOrThrow<string>('EMAIL_PRIVATE_KEY')
          .replace(/\\n/g, '\n'),
        accessUrl: this.configService.getOrThrow<string>('EMAIL_ACCESS_URL'),
      },
      from: `No Reply <${this.configService.getOrThrow<string>('EMAIL_USER')}>`,
      tls: {
        rejectUnauthorized: false,
      },
    });
  }

  /**
   * send email to the email address. with optional from, subject, content
   * @param email email address to send
   * @param from optional, from email address
   * @param subject optional, email subject
   * @param content optional, email content
   * @returns void
   */
  async sendEmail(
    email: string,
    from?: string,
    subject?: string,
    content?: string,
  ): Promise<void> {
    this.logger.log(`send certification email to ${email}`);
    await this.transporter
      .sendMail({
        to: email,
        from,
        subject,
        html: content,
      })
      .catch((error) => {
        this.logger.error(`send certification email error: ${error}`);
        throw error;
      });
  }
}
