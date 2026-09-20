import { Trace } from '@gsainfoteam/nest-observability';
import { Loggable } from '@lib/logger';
import { PrismaService } from '@lib/prisma';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Authenticator, User } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

import { BasicPasskeyDto } from './dto/res.dto';
import { UserConsentType } from './types/userConsent.type';
import { UserWithAuthenticators } from './types/userWithAuthenticators';

@Trace()
@Loggable()
@Injectable()
export class UserRepository {
  private readonly logger = new Logger(UserRepository.name);
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Find user by email
   * @param email email of user to find
   * @returns User object
   */
  async findUserByEmail(email: string): Promise<UserWithAuthenticators> {
    return this.prismaService.user
      .findUniqueOrThrow({
        where: {
          email,
        },
        include: {
          authenticators: true,
        },
      })
      .catch((error) => {
        if (
          error instanceof PrismaClientKnownRequestError &&
          (error.code === 'P2002' || error.code === 'P2025')
        ) {
          this.logger.debug(`user not found with email: ${email}`);
          throw new ForbiddenException('user not found');
        }
        this.logger.error(`find user by email error: ${error}`);
        throw new InternalServerErrorException();
      });
  }

  async checkEmail(email: string): Promise<boolean> {
    return (
      (await this.prismaService.user.findUnique({
        where: {
          email,
        },
      })) != null
    );
  }

  /**
   * Find user by uuid
   * @param uuid uuid of user to find
   * @returns User object
   */
  async findUserByUuid(uuid: string): Promise<User> {
    return this.prismaService.user
      .findUniqueOrThrow({
        where: {
          uuid,
        },
      })
      .catch((error) => {
        if (
          error instanceof PrismaClientKnownRequestError &&
          error.code === 'P2025'
        ) {
          this.logger.debug(`user not found with uuid: ${uuid}`);
          throw new ForbiddenException('user not found');
        }
        this.logger.error(`find user by uuid error: ${error}`);
        throw new InternalServerErrorException();
      });
  }

  async findUserConsentByUuid(uuid: string): Promise<UserConsentType[]> {
    return this.prismaService.consent.findMany({
      where: {
        userUuid: uuid,
      },
      include: {
        client: {
          select: {
            name: true,
            uuid: true,
            scopes: true,
            optionalScopes: true,
          },
        },
      },
    });
  }

  /**
   * create user
   * @param param0 object containing user information
   */
  async createUser({
    email,
    password,
    name,
    studentId,
    phoneNumber,
    isPhoneNumberVerified,
  }: Omit<
    User,
    | 'accessLevel'
    | 'uuid'
    | 'createdAt'
    | 'updatedAt'
    | 'picture'
    | 'profile'
    | 'isIdVerified'
  >): Promise<void> {
    await this.prismaService.user
      .create({
        data: {
          email,
          password,
          name,
          studentId,
          phoneNumber,
          isIdVerified: true,
          isPhoneNumberVerified, // TODO: 해외 전화번호 인증 추가 이후 수정 필요
        },
      })
      .catch((error) => {
        if (
          error instanceof PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          this.logger.debug(`user already exists with email: ${email}`);
          throw new ConflictException('user already exists');
        }
        this.logger.error(`create user error: ${error}`);
        throw new InternalServerErrorException();
      });
  }

  async updateStudentId(
    uuid: string,
    name: string,
    studentId: string,
  ): Promise<void> {
    await this.prismaService.user
      .update({
        where: { uuid },
        data: { name, studentId, isIdVerified: true },
      })
      .catch((error) => {
        if (error instanceof PrismaClientKnownRequestError) {
          if (error.code === 'P2025' || error.code === 'P2002') {
            this.logger.debug(`user not found with uuid: ${uuid}`);
            throw new ForbiddenException('user not found');
          }
          this.logger.debug(`prisma error occurred: ${error.code}`);
          throw new InternalServerErrorException();
        }
        this.logger.error(`update student id error: ${error}`);
        throw new InternalServerErrorException();
      });
  }

  async updatePhoneNumber(uuid: string, phoneNumber: string): Promise<void> {
    await this.prismaService.user
      .update({
        where: { uuid },
        data: { phoneNumber, isPhoneNumberVerified: true },
      })
      .catch((error) => {
        if (error instanceof PrismaClientKnownRequestError) {
          if (error.code === 'P2025' || error.code === 'P2002') {
            this.logger.debug(`user not found with uuid: ${uuid}`);
            throw new ForbiddenException('user not found');
          }
          this.logger.debug(`prisma error occurred: ${error.code}`);
          throw new InternalServerErrorException();
        }
        this.logger.error(`update phone number error: ${error}`);
        throw new InternalServerErrorException();
      });
  }

  /**
   * update user's password
   * @param uuid uuid of user to update
   * @param password new password
   */
  async updateUserPassword(uuid: string, password: string): Promise<void> {
    await this.prismaService.user
      .update({
        where: {
          uuid,
        },
        data: {
          password,
        },
      })
      .catch((error) => {
        if (error instanceof PrismaClientKnownRequestError) {
          if (error.code === 'P2025' || error.code === 'P2002') {
            this.logger.debug(`user not found with uuid: ${uuid}`);
            throw new ForbiddenException('user not found');
          }
          this.logger.debug(`prisma error occurred: ${error.code}`);
          throw new InternalServerErrorException();
        }
        this.logger.error(`update user password error: ${error}`);
        throw new InternalServerErrorException();
      });
  }

  async updateUserPicture(picture: string, uuid: string): Promise<void> {
    await this.prismaService.user
      .update({
        where: {
          uuid,
        },
        data: {
          picture,
        },
      })
      .catch((error) => {
        if (error instanceof PrismaClientKnownRequestError) {
          if (error.code === 'P2025' || error.code === 'P2002') {
            this.logger.debug(`user not found with uuid: ${uuid}`);
            throw new ForbiddenException('user not found');
          }
          this.logger.debug(`prisma error occurred: ${error.code}`);
          throw new InternalServerErrorException();
        }
        this.logger.error(`update user profile error: ${error}`);
        throw new InternalServerErrorException();
      });
  }

  /**
   * delete user
   * @param uuid uuid of user to delete
   */
  async deleteUser(uuid: string): Promise<void> {
    await this.prismaService.user
      .delete({
        where: {
          uuid,
        },
      })
      .catch((error) => {
        if (
          error instanceof PrismaClientKnownRequestError &&
          error.code === 'P2025'
        ) {
          this.logger.debug(`user not found with uuid: ${uuid}`);
          throw new ForbiddenException('user not found');
        }
        this.logger.error(`delete user error: ${error}`);
        throw new InternalServerErrorException();
      });
  }

  /**
   * delete user picture
   * @param uuid uuid of user to delete
   */
  async deleteUserPicture(uuid: string): Promise<void> {
    await this.prismaService.user
      .update({
        where: {
          uuid,
        },
        data: {
          picture: null,
        },
      })
      .catch((error) => {
        if (
          error instanceof PrismaClientKnownRequestError &&
          error.code === 'P2025'
        ) {
          this.logger.debug(`user not found with uuid: ${uuid}`);
          throw new ForbiddenException('user not found');
        }
        this.logger.error(`delete user picture error: ${error}`);
        throw new InternalServerErrorException();
      });
  }

  async getPasskeyList(userUuid: string): Promise<BasicPasskeyDto[]> {
    return await this.prismaService.authenticator.findMany({
      where: { userUuid },
      select: {
        id: true,
        name: true,
        icon: true,
        createdAt: true,
        loginAt: true,
      },
    });
  }

  async getAuthenticator(id: string): Promise<Authenticator> {
    return await this.prismaService.authenticator
      .findUniqueOrThrow({
        where: { id },
      })
      .catch((error) => {
        if (
          error instanceof PrismaClientKnownRequestError &&
          error.code === 'P2025'
        ) {
          this.logger.debug(`passkey not found with uuid: ${id}`);
          throw new ForbiddenException('user not found');
        }
        this.logger.error(`find passkey by uuid error: ${error}`);
        throw new InternalServerErrorException();
      });
  }

  async saveAuthenticator(authenticator: {
    id: string;
    name: string;
    icon?: string;
    publicKey: Uint8Array;
    counter: number;
    userUuid: string;
  }): Promise<Authenticator> {
    return this.prismaService.authenticator
      .create({
        data: authenticator,
      })
      .catch((error) => {
        if (error instanceof PrismaClientKnownRequestError) {
          if (error.code === 'P2002') {
            this.logger.debug(`conflict credentialId: ${authenticator.id}`);
            throw new ConflictException('conflict credentialId');
          }
          this.logger.debug(`prisma error occurred: ${error.code}`);
          throw new InternalServerErrorException();
        }
        this.logger.error(`update user password error: ${error}`);
        throw new InternalServerErrorException();
      });
  }

  async updatePasskey(id: string, name: string): Promise<void> {
    await this.prismaService.authenticator
      .update({
        where: { id },
        data: { name },
      })
      .catch((error) => {
        if (error instanceof PrismaClientKnownRequestError) {
          if (error.code === 'P2025' || error.code === 'P2002') {
            this.logger.debug(`passkey not found with uuid: ${id}`);
            throw new ForbiddenException('passkey not found');
          }
          this.logger.debug(`prisma error occurred: ${error.code}`);
          throw new InternalServerErrorException();
        }
        this.logger.error(`update passkey name error: ${error}`);
        throw new InternalServerErrorException();
      });
  }

  async deletePasskey(id: string): Promise<void> {
    await this.prismaService.authenticator
      .delete({
        where: { id },
      })
      .catch((error) => {
        if (
          error instanceof PrismaClientKnownRequestError &&
          error.code === 'P2025'
        ) {
          this.logger.debug(`passkey not found with uuid: ${id}`);
          throw new ForbiddenException('passkey not found');
        }
        this.logger.error(`delete passkey error: ${error}`);
        throw new InternalServerErrorException();
      });
  }
}
