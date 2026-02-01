import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { HttpService } from '@nestjs/axios';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { catchError, firstValueFrom } from 'rxjs';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly aligoApiUrl =
    this.configService.getOrThrow<string>('ALIGO_API_URL');
  private readonly aligoApiKey =
    this.configService.getOrThrow<string>('ALIGO_API_KEY');
  private readonly aligoApiId =
    this.configService.getOrThrow<string>('ALIGO_API_ID');
  private readonly aligoApiSender =
    this.configService.getOrThrow<string>('ALIGO_API_SENDER');
  private readonly snsClient = new SNSClient({
    region: this.configService.getOrThrow<string>('AWS_SNS_REGION'),
    credentials: {
      accessKeyId: this.configService.getOrThrow<string>(
        'AWS_SNS_ACCESS_KEY_ID',
      ),
      secretAccessKey: this.configService.getOrThrow<string>(
        'AWS_SNS_SECRET_ACCESS_KEY',
      ),
    },
  });
  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  async sendDomesticMessage(phoneNumber: string, msg: string): Promise<void> {
    const body = new URLSearchParams();
    body.append('key', this.aligoApiKey);
    body.append('user_id', this.aligoApiId);
    body.append('sender', this.aligoApiSender);
    body.append('receiver', phoneNumber);
    body.append('msg_type', 'SMS');
    body.append('msg', msg);

    const { result_code, message } = (
      await firstValueFrom(
        this.httpService
          .post<{
            result_code: string;
            message: string;
          }>(this.aligoApiUrl + '/send/', body)
          .pipe(
            catchError((error: AxiosError) => {
              this.logger.error(`failed to send SMS: ${error.message}`);
              throw new InternalServerErrorException('failed to send SMS');
            }),
          ),
      )
    ).data;

    if (result_code !== '1') {
      this.logger.error(`Aligo SMS send error: ${result_code} ${message}`);
      throw new InternalServerErrorException('failed to send SMS');
    }
  }

  async sendInternationalMessage(
    phoneNumber: string,
    msg: string,
  ): Promise<void> {
    const command = new PublishCommand({
      Message: msg,
      PhoneNumber: phoneNumber,
    });
    await this.snsClient.send(command).catch((error) => {
      this.logger.error(`failed to send SMS via SNS: ${error}`);
      throw new InternalServerErrorException('failed to send SMS');
    });
  }
}
