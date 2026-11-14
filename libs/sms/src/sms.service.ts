import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { Trace } from '@gsainfoteam/nest-observability';
import { HttpService } from '@nestjs/axios';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { catchError, firstValueFrom } from 'rxjs';

@Trace()
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
  private readonly aligoKakaoApiUrl = this.configService.get<string>(
    'ALIGO_KAKAO_API_URL',
    'https://kakaoapi.aligo.in',
  );
  private readonly aligoKakaoSenderKey = this.configService.get<string>(
    'ALIGO_KAKAO_SENDER_KEY',
  );
  private readonly aligoKakaoTemplateCode = this.configService.get<string>(
    'ALIGO_KAKAO_TEMPLATE_CODE',
  );
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

  /**
   * whether the alimtalk (Kakao) channel is configured
   */
  get isAlimtalkEnabled(): boolean {
    return !!this.aligoKakaoSenderKey && !!this.aligoKakaoTemplateCode;
  }

  /**
   * send a Kakao alimtalk message using the registered template.
   * `message` must exactly match the registered template (including line breaks)
   * with the variables filled in, otherwise Aligo refuses to send it.
   * `failoverMessage` is sent as SMS by Aligo if the alimtalk cannot be delivered.
   */
  async sendAlimtalk(
    phoneNumber: string,
    message: string,
    failoverMessage: string,
  ): Promise<void> {
    const body = new URLSearchParams();
    body.append('apikey', this.aligoApiKey);
    body.append('userid', this.aligoApiId);
    body.append('senderkey', this.aligoKakaoSenderKey!);
    body.append('tpl_code', this.aligoKakaoTemplateCode!);
    body.append('sender', this.aligoApiSender);
    body.append('receiver_1', phoneNumber);
    body.append('subject_1', '인증코드');
    body.append('message_1', message);
    body.append('failover', 'Y');
    body.append('fsubject_1', '인증코드');
    body.append('fmessage_1', failoverMessage);

    const { code, message: resMessage } = (
      await firstValueFrom(
        this.httpService
          .post<{
            code: number;
            message: string;
          }>(`${this.aligoKakaoApiUrl}/akv10/alimtalk/send/`, body)
          .pipe(
            catchError((error: AxiosError) => {
              this.logger.error(`failed to send alimtalk: ${error.message}`);
              throw new InternalServerErrorException('failed to send alimtalk');
            }),
          ),
      )
    ).data;

    if (Number(code) !== 0) {
      this.logger.error(`Aligo alimtalk send error: ${code} ${resMessage}`);
      throw new InternalServerErrorException('failed to send alimtalk');
    }
  }

  async sendInternationalMessage(
    phoneNumber: string,
    msg: string,
  ): Promise<void> {
    const command = new PublishCommand({
      Message: msg,
      PhoneNumber: phoneNumber,
      MessageAttributes: {
        'AWS.SNS.SMS.SMSType': {
          DataType: 'String',
          StringValue: 'Transactional',
        },
      },
    });
    await this.snsClient.send(command).catch((error) => {
      this.logger.error(`failed to send SMS via SNS: ${error}`);
      throw new InternalServerErrorException('failed to send SMS');
    });
  }
}
