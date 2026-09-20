import { Trace } from '@gsainfoteam/nest-observability';
import { Loggable } from '@lib/logger/decorator/loggable';
import { PrismaService } from '@lib/prisma';
import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Client, RoleType } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

import { ClientMember } from './types/clientMember.type';

@Injectable()
@Loggable()
@Trace()
export class ClientRepository {
  private readonly logger = new Logger(ClientRepository.name);
  constructor(private readonly prismaService: PrismaService) {}

  async findClientListByUserUuid(userUuid: string): Promise<Client[]> {
    return this.prismaService.client.findMany({
      where: {
        userLinks: {
          some: {
            userUuid: userUuid,
          },
        },
      },
    });
  }

  async findClientByUuid(uuid: string): Promise<Client> {
    return this.prismaService.client
      .findUniqueOrThrow({
        where: {
          uuid,
        },
      })
      .catch((error) => {
        if (
          error instanceof PrismaClientKnownRequestError &&
          error.code == 'P2025'
        ) {
          this.logger.debug(`findClientByUuid error: ${error.stack}`);
          throw new NotFoundException();
        }
        this.logger.error(`findClientByUuid error: ${error}`);
        throw new InternalServerErrorException();
      });
  }

  async findClientByUuidAndUserUuid(
    uuid: string,
    userUuid: string,
  ): Promise<Client> {
    return this.prismaService.client
      .findFirstOrThrow({
        where: {
          uuid,
          userLinks: {
            some: {
              userUuid: userUuid,
            },
          },
        },
      })
      .catch((error) => {
        if (
          error instanceof PrismaClientKnownRequestError &&
          error.code === 'P2025'
        ) {
          this.logger.debug(
            `findClientByUuidAndUserUuid error: ${error.stack}`,
          );
          throw new NotFoundException();
        }
        this.logger.error(`findClientByUuidAndUserUuid error: ${error}`);
        throw new InternalServerErrorException();
      });
  }

  async createClient(
    {
      name,
      urls,
      secret,
    }: Pick<Client, 'name' | 'secret'> & Partial<Pick<Client, 'urls'>>,
    userUuid: string,
  ): Promise<Client> {
    return this.prismaService.client
      .create({
        data: {
          name,
          urls,
          secret,
          userLinks: {
            create: {
              userUuid: userUuid,
              role: RoleType.OWNER,
            },
          },
        },
      })
      .catch((error) => {
        if (
          error instanceof PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          this.logger.debug(`createClient: error=${error.stack}`);
          throw new ConflictException('Client already exists');
        }
        this.logger.error(`createClient error: ${error}`);
        throw new InternalServerErrorException();
      });
  }

  async updateClientSecret(
    { uuid, secret }: Pick<Client, 'uuid' | 'secret'>,
    userUuid: string,
  ): Promise<Client> {
    return this.prismaService.client
      .update({
        where: {
          uuid,
          userLinks: {
            some: {
              userUuid: userUuid,
            },
          },
        },
        data: {
          secret,
        },
      })
      .catch((error) => {
        if (
          error instanceof PrismaClientKnownRequestError &&
          error.code === 'P2025'
        ) {
          this.logger.debug(`updateClientSecret: error=${error.stack}`);
          throw new NotFoundException();
        }
        this.logger.error(`updateClientSecret: error=${error}`);
        throw new InternalServerErrorException();
      });
  }

  async updateClient(
    {
      uuid,
      name,
      urls,
      scopes,
      optionalScopes,
      idTokenAllowed,
    }: Pick<Client, 'uuid'> &
      Partial<
        Pick<
          Client,
          'name' | 'urls' | 'scopes' | 'optionalScopes' | 'idTokenAllowed'
        >
      >,
    userUuid: string,
  ): Promise<Client> {
    return this.prismaService.client
      .update({
        where: {
          uuid,
          userLinks: {
            some: {
              userUuid: userUuid,
            },
          },
        },
        data: {
          name,
          urls,
          scopes,
          optionalScopes,
          idTokenAllowed,
        },
      })
      .catch((error) => {
        if (
          error instanceof PrismaClientKnownRequestError &&
          error.code === 'P2025'
        ) {
          this.logger.debug(`updateClient error: ${error.stack}`);
          throw new NotFoundException();
        }
        this.logger.error(`updateClient error: ${error}`);
        throw new InternalServerErrorException();
      });
  }

  async getMembersToClient(uuid: string): Promise<ClientMember[]> {
    return await this.prismaService.user
      .findMany({
        where: {
          memberships: {
            some: {
              client: {
                uuid,
              },
            },
          },
        },
        select: {
          uuid: true,
          name: true,
          email: true,
          picture: true,
          memberships: {
            where: {
              client: {
                uuid,
              },
            },
            select: {
              role: true,
            },
          },
        },
      })
      .catch((error) => {
        if (error instanceof PrismaClientKnownRequestError) {
          this.logger.debug(`database error: ${error.stack}`);
          throw new InternalServerErrorException();
        }
        this.logger.error(`getMembersToClient error: ${error}`);
        throw new InternalServerErrorException();
      });
  }

  async addMemberToClient(uuid: string, memberEmail: string): Promise<void> {
    const member = await this.prismaService.user.findUnique({
      where: { email: memberEmail },
    });
    if (!member) throw new NotFoundException('User not found');
    await this.prismaService.client
      .update({
        where: {
          uuid: uuid,
        },
        data: {
          userLinks: {
            create: {
              userUuid: member.uuid,
              role: RoleType.MEMBER,
            },
          },
        },
      })
      .catch((error) => {
        if (error instanceof PrismaClientKnownRequestError) {
          this.logger.debug(`addMemberToClient error: ${error.stack}`);
          if (error.code === 'P2025') {
            throw new NotFoundException();
          }
          if (error.code === 'P2002') {
            throw new ConflictException();
          }
        }
        this.logger.error(`addMemberToClient error: ${error}`);
        throw new InternalServerErrorException();
      });
  }

  async updateClientPicture(
    picture: string,
    uuid: string,
    userUuid: string,
  ): Promise<Client> {
    return this.prismaService.client
      .update({
        where: {
          uuid,
          userLinks: {
            some: {
              userUuid: userUuid,
            },
          },
        },
        data: {
          picture,
        },
      })
      .catch((error) => {
        if (
          error instanceof PrismaClientKnownRequestError &&
          error.code === 'P2025'
        ) {
          this.logger.debug(`updateClientPicture error: ${error.stack}`);
          throw new NotFoundException();
        }
        this.logger.error(`updateClientPicture error: ${error}`);
        throw new InternalServerErrorException();
      });
  }

  async setRoleToUser(
    uuid: string,
    userUuid: string,
    role: RoleType,
  ): Promise<void> {
    await this.prismaService.userClientRelation
      .update({
        where: {
          userUuid_clientUuid: {
            userUuid: userUuid,
            clientUuid: uuid,
          },
        },
        data: { role },
      })
      .catch((error) => {
        if (error instanceof PrismaClientKnownRequestError) {
          this.logger.debug(`setRoleToUser error: ${error.stack}`);
          if (error.code === 'P2025') {
            throw new NotFoundException();
          }
        }
        this.logger.error(`setRoleToUser error: ${error}`);
        throw new InternalServerErrorException();
      });
  }

  async transferOwnership(
    clientUuid: string,
    currentOwnerUuid: string,
    newOwnerUuid: string,
  ): Promise<void> {
    await this.prismaService
      .$transaction(async (prisma) => {
        await prisma.userClientRelation.update({
          where: {
            userUuid_clientUuid: {
              userUuid: currentOwnerUuid,
              clientUuid: clientUuid,
            },
          },
          data: { role: RoleType.ADMIN },
        });
        await prisma.userClientRelation.update({
          where: {
            userUuid_clientUuid: {
              userUuid: newOwnerUuid,
              clientUuid: clientUuid,
            },
          },
          data: { role: RoleType.OWNER },
        });
      })
      .catch((error) => {
        if (error instanceof PrismaClientKnownRequestError) {
          this.logger.debug(`transferOwnership error: ${error.stack}`);
          if (error.code === 'P2025') {
            throw new NotFoundException();
          }
        }
        this.logger.error(`transferOwnership error: ${error}`);
        throw new InternalServerErrorException();
      });
  }

  async deleteRequestClient(uuid: string, userUuid: string): Promise<void> {
    await this.prismaService.client
      .update({
        where: {
          uuid,
          userLinks: {
            some: {
              userUuid: userUuid,
            },
          },
        },
        data: {
          deleteRequestedAt: new Date(),
        },
      })
      .catch((error) => {
        if (
          error instanceof PrismaClientKnownRequestError &&
          error.code === 'P2025'
        ) {
          this.logger.debug(`deleteRequestClient error: ${error.stack}`);
          throw new NotFoundException();
        }
        this.logger.error(`deleteRequestClient error: ${error}`);
        throw new InternalServerErrorException();
      });
  }

  async removeMemberFromClient(uuid: string, userUuid: string): Promise<void> {
    await this.prismaService.client
      .update({
        where: {
          uuid: uuid,
        },
        data: {
          userLinks: {
            delete: {
              userUuid_clientUuid: {
                userUuid: userUuid,
                clientUuid: uuid,
              },
            },
          },
        },
      })
      .catch((error) => {
        if (
          error instanceof PrismaClientKnownRequestError &&
          error.code === 'P2025'
        ) {
          this.logger.debug(`removeMemberFromClient error: ${error.stack}`);
          throw new NotFoundException();
        }
        this.logger.error(`removeMemberFromClient error: ${error}`);
        throw new InternalServerErrorException();
      });
  }

  async deleteClientPicture(uuid: string, userUuid: string): Promise<void> {
    await this.prismaService.client
      .update({
        where: {
          uuid,
          userLinks: {
            some: {
              userUuid: userUuid,
            },
          },
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
          this.logger.debug(`deleteClientPicture error: ${error.stack}`);
          throw new NotFoundException();
        }
        this.logger.error(`deleteClientPicture error: ${error}`);
        throw new InternalServerErrorException();
      });
  }

  async getUserClientRole(
    clientUuid: string,
    userUuid: string,
  ): Promise<RoleType> {
    return this.prismaService.userClientRelation
      .findUniqueOrThrow({
        where: {
          userUuid_clientUuid: {
            clientUuid: clientUuid,
            userUuid: userUuid,
          },
        },
        select: {
          role: true,
        },
      })
      .then((r) => r.role)
      .catch((error) => {
        if (
          error instanceof PrismaClientKnownRequestError &&
          error.code === 'P2025'
        ) {
          this.logger.debug(`getUserClientRole error: ${error.stack}`);
          throw new NotFoundException();
        }
        this.logger.error(`getUserClientRole error: ${error}`);
        throw new InternalServerErrorException();
      });
  }
}
