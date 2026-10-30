import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

export class MockConfigService {
  private readonly configMap: Map<string, any> = new Map();

  constructor(envFilePath?: string) {
    // 먼저 .env 파일에서 기본값 로드
    this.loadFromEnvFile(envFilePath);

    // process.env에서 컨테이너 설정값 로드 (우선순위 높음)
    this.loadFromProcessEnv();
  }

  private loadFromEnvFile(customEnvPath?: string): void {
    const envFilePath =
      customEnvPath || path.resolve(process.cwd(), 'test', '.test.env');

    if (fs.existsSync(envFilePath)) {
      const envConfig = dotenv.parse(fs.readFileSync(envFilePath));

      // 환경변수를 configMap에 설정
      for (const key in envConfig) {
        if (Object.prototype.hasOwnProperty.call(envConfig, key)) {
          this.set(key, envConfig[key]);
        }
      }
    } else {
      console.warn(`${envFilePath} 파일을 찾을 수 없습니다.`);
    }
  }

  private loadFromProcessEnv(): void {
    // 테스트 컨테이너에서 설정된 환경 변수 가져오기
    const containerEnvKeys = [
      'DATABASE_URL',
      'REDIS_URL',
      'EMAIL_HOST',
      'EMAIL_PORT',
      'EMAIL_ACCESS_URL',
    ];

    for (const key of containerEnvKeys) {
      if (process.env[key]) {
        this.set(key, process.env[key]);
      }
    }
  }

  set(key: string, value: any): void {
    this.configMap.set(key, value);
  }

  get<T>(key: string): T {
    return this.configMap.get(key) as T;
  }

  getOrThrow<T>(key: string): T {
    if (!this.configMap.has(key)) {
      throw new Error(`${key} 설정을 찾을 수 없습니다.`);
    }
    return this.configMap.get(key) as T;
  }
}
