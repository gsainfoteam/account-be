import { Trace } from '@gsainfoteam/nest-observability';
import { Injectable, Logger } from '@nestjs/common';

interface SentEmail {
  to: string;
  from?: string;
  subject?: string;
  content?: string;
}

@Injectable()
@Trace()
export class MockMailService {
  private readonly logger = new Logger(MockMailService.name);
  // 전송된 이메일을 저장하는 배열
  private readonly sentEmails: SentEmail[] = [];

  /**
   * 이메일 전송을 시뮬레이션하고 메모리에 저장합니다.
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async sendEmail(
    email: string,
    from?: string,
    subject?: string,
    content?: string,
  ): Promise<void> {
    this.logger.log(`[MOCK] 이메일 전송 to: ${email}`);

    const sentEmail: SentEmail = {
      to: email,
      from,
      subject,
      content,
    };

    this.sentEmails.push(sentEmail);
  }

  getLastEmailSentTo(email: string): SentEmail | null {
    // 가장 최근에 전송된 이메일부터 역순으로 확인
    for (let i = this.sentEmails.length - 1; i >= 0; i--) {
      if (this.sentEmails[i].to === email) {
        return this.sentEmails[i];
      }
    }
    return null;
  }

  getAllSentEmails(): SentEmail[] {
    return [...this.sentEmails];
  }

  clearSentEmails(): void {
    this.sentEmails.length = 0;
  }
}
