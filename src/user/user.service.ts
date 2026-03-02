import { Loggable } from '@lib/logger';
import { MailService } from '@lib/mail';
import { ObjectService } from '@lib/object';
import { CacheNotFoundException, RedisService } from '@lib/redis';
import { TemplatesService } from '@lib/templates';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User } from '@prisma/client';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import {
  PublicKeyCredentialCreationOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/types';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { ParseError, parsePhoneNumberWithError } from 'libphonenumber-js';
import { VerifyStudentIdDto } from 'src/verify/dto/req.dto';
import { VerificationJwtPayloadType } from 'src/verify/types/verificationJwtPayload.type';
import { VerifyService } from 'src/verify/verify.service';

import {
  ChangePasswordDto,
  DeleteUserReqDto,
  IssueUserSecretDto,
  RegisterDto,
  VerifyPhoneNumberDto,
} from './dto/req.dto';
import { BasicPasskeyDto, UpdateUserPictureResDto } from './dto/res.dto';
import { UserConsentType } from './types/userConsent.type';
import { UserRepository } from './user.repository';

@Loggable()
@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);
  private readonly sender =
    this.configService.get<string | undefined>('EMAIL_SENDER') ??
    this.configService.get<string>('EMAIL_USER');
  private readonly passkeyPrefix = 'passkeyRegister';
  private readonly passkeyRpOrigin: string;
  private readonly passkeyRpId: string;
  private readonly verifyStudentIdUrl = this.configService.getOrThrow<string>(
    'VERIFY_STUDENT_ID_URL',
  );
  private readonly phoneNumberVerificationCodePrefix =
    'PhoneNumberVerificationCode';

  constructor(
    private readonly userRepository: UserRepository,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    private readonly verifyService: VerifyService,
    private readonly objectService: ObjectService,
    private readonly redisService: RedisService,
    private readonly templatesService: TemplatesService,
  ) {
    this.passkeyRpOrigin =
      this.configService.getOrThrow<string>('PASSKEY_RP_ORIGIN');
    this.passkeyRpId = this.configService.getOrThrow<string>('PASSKEY_RP_ID');
  }

  /**
   * find the user by email
   * @param param0 it contains email
   * @returns user if the user exists
   */
  async findUserByUuid({ uuid }: Pick<User, 'uuid'>): Promise<User> {
    const user = await this.userRepository.findUserByUuid(uuid);
    return {
      ...user,
      picture:
        user.picture === null ? null : this.objectService.getUrl(user.picture),
    };
  }

  async checkEmail(email: string): Promise<boolean> {
    return await this.userRepository.checkEmail(email);
  }

  async findUserConsentByUuid({
    uuid,
  }: Pick<User, 'uuid'>): Promise<UserConsentType[]> {
    return this.userRepository.findUserConsentByUuid(uuid);
  }

  /**
   * register the user to the database
   * @param param0 it contains email, password, name, studentId, phoneNumber, verificationJwtToken
   */
  async register({
    email,
    password,
    name,
    studentId,
    phoneNumber,
    emailVerificationJwtToken,
    studentIdVerificationJwtToken,
    phoneNumberVerificationJwtToken,
  }: RegisterDto): Promise<void> {
    const emailPayload: VerificationJwtPayloadType =
      await this.verifyService.validateJwtToken(emailVerificationJwtToken);

    if (emailPayload.hint !== 'email') {
      this.logger.debug('verification hint is not email');
      throw new ForbiddenException('verification hint is not email');
    }

    if (emailPayload.sub !== email) {
      this.logger.debug('verification jwt token not valid');
      throw new ForbiddenException('verification jwt token not valid');
    }

    const isStudentEmail = email.endsWith('@gm.gist.ac.kr');

    if (isStudentEmail) {
      if (!studentIdVerificationJwtToken)
        throw new ForbiddenException('student id verification jwt is required');

      const studentIdPayload: VerificationJwtPayloadType =
        await this.verifyService.validateJwtToken(
          studentIdVerificationJwtToken,
        );

      if (studentIdPayload.hint !== 'studentId') {
        this.logger.debug('verification hint is not studentId');
        throw new ForbiddenException('verification hint is not studentId');
      }

      if (studentIdPayload.sub !== studentId) {
        this.logger.debug('verification jwt token not valid');
        throw new ForbiddenException('verification jwt token not valid');
      }
    }

    let isKoreanPhoneNumber = false;
    try {
      const parsedPhoneNumber = parsePhoneNumberWithError(phoneNumber, {
        defaultCountry: 'KR',
      });
      isKoreanPhoneNumber = parsedPhoneNumber.country === 'KR';
    } catch (error) {
      if (error instanceof ParseError) {
        this.logger.debug('Failed to parse phone number', error);
        throw new BadRequestException('Failed to parse phone number');
      } else {
        this.logger.error('Unexpected error while parsing phone number', error);
        throw new InternalServerErrorException(
          'Unexpected error while parsing phone number',
        );
      }
    }

    if (isKoreanPhoneNumber) {
      if (!phoneNumberVerificationJwtToken) {
        throw new ForbiddenException(
          'phone number verification jwt is required for Korean phone numbers',
        );
      }

      const phoneNumberPayload: VerificationJwtPayloadType =
        await this.verifyService.validateJwtToken(
          phoneNumberVerificationJwtToken,
        );

      if (phoneNumberPayload.hint !== 'phoneNumber') {
        this.logger.debug('verification hint is not phoneNumber');
        throw new ForbiddenException('verification hint is not phoneNumber');
      }

      if (phoneNumberPayload.sub !== phoneNumber) {
        this.logger.debug('verification jwt token not valid');
        throw new ForbiddenException('verification jwt token not valid');
      }
    }

    const hashedPassword: string = bcrypt.hashSync(
      password,
      bcrypt.genSaltSync(10),
    );
    await this.userRepository.createUser({
      email,
      password: hashedPassword,
      name,
      studentId,
      phoneNumber,
      isPhoneNumberVerified: isKoreanPhoneNumber,
    });
  }

  async verifyStudentId(uuid: string, dto: VerifyStudentIdDto): Promise<void> {
    const studentId = await this.verifyService.getStudentId(
      dto.firstName ?? dto.name,
      dto.birthDate,
    );
    await this.userRepository.updateStudentId(uuid, dto.name, studentId);
  }

  async verifyPhoneNumber(
    uuid: string,
    { phoneNumber, code }: VerifyPhoneNumberDto,
  ): Promise<void> {
    const cachedCode = await this.redisService
      .getOrThrow<string>(phoneNumber, {
        prefix: this.phoneNumberVerificationCodePrefix,
      })
      .catch((error) => {
        if (error instanceof CacheNotFoundException) {
          this.logger.debug(
            `Redis cache not found with subject: ${phoneNumber}`,
          );
          throw new BadRequestException('invalid phone number or code');
        }
        this.logger.error(`Redis get error: ${error}`);
        throw new InternalServerErrorException();
      });

    if (
      Buffer.from(code).length !== Buffer.from(cachedCode).length ||
      !crypto.timingSafeEqual(Buffer.from(code), Buffer.from(cachedCode))
    ) {
      this.logger.debug(`code not matched: ${code}`);
      throw new BadRequestException('invalid phone number or code');
    }

    await this.userRepository.updatePhoneNumber(uuid, phoneNumber);

    await this.redisService.del(phoneNumber, {
      prefix: this.phoneNumberVerificationCodePrefix,
    });
  }

  /**
   * issue a new password to the user
   * @param param0 it contains email
   */
  async issuePassword({ email }: IssueUserSecretDto): Promise<void> {
    const user = await this.userRepository.findUserByEmail(email);
    const newPassword = crypto.randomBytes(18).toString('base64');
    await this.mailService.sendEmail(
      email,
      `"인포팀 계정" <${this.sender}>`,
      '인포팀 계정 임시 비밀번호',
      await this.templatesService.renderTemporaryPassword(newPassword),
    );
    await this.userRepository.updateUserPassword(
      user.uuid,
      bcrypt.hashSync(newPassword, bcrypt.genSaltSync(10)),
    );
  }

  /**
   * change the user password (validate the user from the jwt token that comes from the email)
   * @param param0 it contains email, password, verificationJwtToken
   */
  async changePassword(
    { password, oldPassword }: ChangePasswordDto,
    user: User,
  ): Promise<void> {
    if (!bcrypt.compareSync(oldPassword, user.password)) {
      this.logger.debug('old password not valid');
      throw new ForbiddenException('old password not valid');
    }
    const hashedPassword: string = bcrypt.hashSync(
      password,
      bcrypt.genSaltSync(10),
    );
    await this.userRepository.updateUserPassword(user.uuid, hashedPassword);
  }

  /**
   * create presignedUrl for the user profile image and store it to the database
   * @param userUuid user uuid
   * @returns updateUserProfileResDto that contains presignedUrl
   */
  async updateUserPicture(
    length: number,
    userUuid: string,
  ): Promise<UpdateUserPictureResDto> {
    const key = `user/${userUuid}/profile_${crypto.randomBytes(16).toString('base64url')}.webp`;
    const presignedUrl = await this.objectService.createPresignedUrl(
      key,
      length,
    );
    await this.userRepository.updateUserPicture(key, userUuid);
    return {
      presignedUrl,
    };
  }

  /**
   * validate user's password and delete user
   * @param userUuid user's uuid
   * @param param1 object that contains password
   */
  async deleteUser(
    userUuid: string,
    { password }: DeleteUserReqDto,
  ): Promise<void> {
    const user = await this.userRepository.findUserByUuid(userUuid);
    if (!bcrypt.compareSync(password, user.password)) {
      throw new ForbiddenException('password is not valid');
    }
    await this.userRepository.deleteUser(userUuid);
  }

  /**
   * validate user and delete user profile image
   * @param userUuid user's uuid
   */
  async deleteUserPicture(userUuid: string): Promise<void> {
    const user = await this.userRepository.findUserByUuid(userUuid);
    if (!user.picture) {
      this.logger.debug('user picture not found');
      return;
    }
    await this.userRepository.deleteUserPicture(userUuid);
    await this.objectService.deleteObject(`user/${userUuid}/profile.webp`);
  }

  async getPasskeyList(userUuid: string): Promise<BasicPasskeyDto[]> {
    return await this.userRepository.getPasskeyList(userUuid);
  }

  async registerOptions(
    email: string,
  ): Promise<PublicKeyCredentialCreationOptionsJSON> {
    const user = await this.userRepository.findUserByEmail(email);

    const options = await generateRegistrationOptions({
      rpName: 'account',
      rpID: this.passkeyRpId,
      userID: Buffer.from(user.uuid),
      userName: user.name,
      excludeCredentials: user.authenticators.map((auth) => ({
        id: auth.id,
        type: 'public-key',
      })),
    });

    await this.redisService.set<string>(user.uuid, options.challenge, {
      prefix: this.passkeyPrefix,
      ttl: 10 * 60,
    });

    return options;
  }

  async verifyRegistration(
    email: string,
    name: string,
    response: RegistrationResponseJSON,
    icon?: string,
  ): Promise<boolean> {
    const user = await this.userRepository.findUserByEmail(email);
    const expectedChallenge = await this.redisService.getOrThrow<string>(
      user.uuid,
      {
        prefix: this.passkeyPrefix,
      },
    );

    const { verified, registrationInfo } = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: this.passkeyRpOrigin,
      expectedRPID: this.passkeyRpId,
    });

    if (!verified || !registrationInfo) {
      throw new UnauthorizedException();
    }

    await this.redisService.del(user.uuid, { prefix: this.passkeyPrefix });

    const { id, publicKey, counter } = registrationInfo.credential;

    await this.userRepository.saveAuthenticator({
      id,
      name,
      icon,
      publicKey,
      counter,
      userUuid: user.uuid,
    });

    return true;
  }

  async updatePasskey(
    id: string,
    name: string,
    userUuid: string,
  ): Promise<void> {
    const auth = await this.userRepository.getAuthenticator(id);

    if (auth.userUuid !== userUuid) throw new ForbiddenException();

    return await this.userRepository.updatePasskey(id, name);
  }

  async deletePasskey(id: string, userUuid: string): Promise<void> {
    const auth = await this.userRepository.getAuthenticator(id);

    if (auth.userUuid !== userUuid) throw new ForbiddenException();

    return await this.userRepository.deletePasskey(id);
  }
}
