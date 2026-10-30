import fastifyCookie from '@fastify/cookie';
import { MailModule, MailService } from '@lib/mail';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { MockConfigService } from './mock/config/mock-config.module';
import { MockMailModule } from './mock/mail/mock-mail.module';
import { MockMailService } from './mock/mail/mock-mail.service';

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */

const TEST_DATA = {
  USER: {
    EMAIL: 'test-user-lifecycle@gm.gist.ac.kr',
    INITIAL_PASSWORD: 'TestPswd!213',
    NAME: 'testUserLifecycle',
    STUDENT_ID: '20000001',
    PHONE_NUMBER: '01012345678',
  },
  INVALID_USER: {
    EMAIL: 'test-wrong-user-lifecycle@gm.gist.ac.kr',
    NAME: 'testUser2Lifecycle',
    STUDENT_ID: '20000002',
    PHONE_NUMBER: '01087654321',
  },
  INVALID_EMAILS: {
    NON_GIST: 'test@gmail.com',
    WRONG_FORMAT: 'not-an-email',
    WRONG_DOMAIN: 'test@wrong.gist.ac.kr',
  },
  VERIFICATION: {
    WRONG_CODE: '123456abcdef',
    INVALID_TOKEN: 'invalid-token',
    EMAIL_HINT: 'email',
  },
  PROFILE: {
    IMAGE_LENGTH: 1024,
  },
  NEW_PASSWORD: 'NewTest123!@#',
} as const;

describe('User Lifecycle Flow', () => {
  let app: NestFastifyApplication;
  let httpRequest: any;
  let mailService: MockMailService;
  let verificationToken: string;
  let userToken: string;
  let currentPassword: string = TEST_DATA.USER.INITIAL_PASSWORD;

  const config = new MockConfigService();
  // student id and phone number checks call outside services, so the test signs their results as VerifyService would
  const signVerification = (sub: string, hint: 'studentId' | 'phoneNumber') =>
    new JwtService({
      secret: config.getOrThrow<string>('VERIFICATION_JWT_SECRET'),
    }).sign(
      { iss: config.getOrThrow<string>('JWT_ISSUER'), sub, hint },
      { algorithm: 'HS256', expiresIn: '10m' },
    );

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      // AppModule's ConfigModule.forRoot() is a dynamic module that overrideModule(ConfigModule) does not reach
      .overrideProvider(ConfigService)
      .useValue(config)
      .overrideModule(MailModule)
      .useModule(MockMailModule)
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.register(fastifyCookie);
    mailService = moduleFixture.get<MailService>(
      MailService,
    ) as unknown as MockMailService;
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    httpRequest = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  it('[1] Email Verification: Should send and verify code with valid email', async () => {
    mailService.clearSentEmails();

    await httpRequest
      .post('/verify/email')
      .send({ email: TEST_DATA.USER.EMAIL })
      .expect(201);

    const email = mailService.getLastEmailSentTo(TEST_DATA.USER.EMAIL);
    if (!email) {
      fail('이메일이 전송되지 않았습니다');
      return;
    }

    expect(email.to).toEqual(TEST_DATA.USER.EMAIL);
    expect(email.subject).toContain('인증 코드');

    const content = email.content || fail('이메일 내용이 없습니다');
    const codeRegex = />\s*(\d{6})\s*</;
    const matches = content.match(codeRegex);
    const code = matches ? matches[1] : fail('인증 코드를 찾을 수 없습니다');

    const verifyResponse = await httpRequest
      .post('/verify')
      .send({
        subject: TEST_DATA.USER.EMAIL,
        code,
        hint: TEST_DATA.VERIFICATION.EMAIL_HINT,
      })
      .expect(201);

    verificationToken = verifyResponse.body.verificationJwtToken;
    expect(verificationToken).toBeDefined();
    expect(typeof verificationToken).toBe('string');
  });

  it('[1-1] Email Verification: Should fail verification with wrong code', async () => {
    await httpRequest
      .post('/verify')
      .send({
        subject: TEST_DATA.USER.EMAIL,
        code: TEST_DATA.VERIFICATION.WRONG_CODE,
        hint: TEST_DATA.VERIFICATION.EMAIL_HINT,
      })
      .expect(400);
  });

  it('[1-2] Email Verification: Should fail with non-GIST email', async () => {
    await httpRequest
      .post('/verify/email')
      .send({ email: TEST_DATA.INVALID_EMAILS.NON_GIST })
      .expect(400);
  });

  it('[1-3] Email Verification: Should fail with wrong email format', async () => {
    await httpRequest
      .post('/verify/email')
      .send({ email: TEST_DATA.INVALID_EMAILS.WRONG_FORMAT })
      .expect(400);
  });

  it('[1-4] Email Verification: Should fail with wrong GIST email domain', async () => {
    await httpRequest
      .post('/verify/email')
      .send({ email: TEST_DATA.INVALID_EMAILS.WRONG_DOMAIN })
      .expect(400);
  });

  it('[2] Registration: Should register new user after email verification', async () => {
    const registerData = {
      email: TEST_DATA.USER.EMAIL,
      password: currentPassword,
      name: TEST_DATA.USER.NAME,
      studentId: TEST_DATA.USER.STUDENT_ID,
      phoneNumber: TEST_DATA.USER.PHONE_NUMBER,
      emailVerificationJwtToken: verificationToken,
      studentIdVerificationJwtToken: signVerification(
        TEST_DATA.USER.STUDENT_ID,
        'studentId',
      ),
      phoneNumberVerificationJwtToken: signVerification(
        TEST_DATA.USER.PHONE_NUMBER,
        'phoneNumber',
      ),
    };

    await httpRequest.post('/user').send(registerData).expect(201);
  });

  it('[2-1] Registration: Should fail registration with invalid verification token', async () => {
    const registerData = {
      email: TEST_DATA.INVALID_USER.EMAIL,
      password: currentPassword,
      name: TEST_DATA.INVALID_USER.NAME,
      studentId: TEST_DATA.INVALID_USER.STUDENT_ID,
      phoneNumber: TEST_DATA.INVALID_USER.PHONE_NUMBER,
      verificationJwtToken: TEST_DATA.VERIFICATION.INVALID_TOKEN,
    };

    await httpRequest.post('/user').send(registerData).expect(400);
  });

  it('[3] Authentication: Should login and receive access token', async () => {
    const loginResponse = await httpRequest
      .post('/auth/login')
      .send({
        email: TEST_DATA.USER.EMAIL,
        password: currentPassword,
      })
      .expect(201);

    userToken = loginResponse.body.accessToken;
    expect(userToken).toBeDefined();
  });

  it('[4] User Profile: Should retrieve user information when authenticated', async () => {
    const response = await httpRequest
      .get('/user')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('email', TEST_DATA.USER.EMAIL);
    expect(response.body).toHaveProperty('name', TEST_DATA.USER.NAME);
    expect(response.body).toHaveProperty(
      'studentId',
      TEST_DATA.USER.STUDENT_ID,
    );
    expect(response.body).toHaveProperty(
      'phoneNumber',
      TEST_DATA.USER.PHONE_NUMBER,
    );
  });

  it('[5] Profile Management: Should get presigned URL for profile image upload', async () => {
    const response = await httpRequest
      .patch('/user/picture')
      .set('Authorization', `Bearer ${userToken}`)
      .query({ length: TEST_DATA.PROFILE.IMAGE_LENGTH })
      .expect(200);

    expect(response.body).toHaveProperty('presignedUrl');
    expect(typeof response.body.presignedUrl).toBe('string');
  });

  it('[6] Password Update: Should change password with the old one and login with the new password', async () => {
    await httpRequest
      .patch('/user/password')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        oldPassword: currentPassword,
        password: TEST_DATA.NEW_PASSWORD,
      })
      .expect(200);

    await httpRequest
      .post('/auth/login')
      .send({
        email: TEST_DATA.USER.EMAIL,
        password: TEST_DATA.NEW_PASSWORD,
      })
      .expect(201);

    currentPassword = TEST_DATA.NEW_PASSWORD;
  });

  it('[7] Account Deletion: Should delete account after password confirmation', async () => {
    await httpRequest
      .delete('/user')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        password: currentPassword,
      })
      .expect(200);

    await httpRequest
      .post('/auth/login')
      .send({
        email: TEST_DATA.USER.EMAIL,
        password: currentPassword,
      })
      .expect(401);
  });
});
