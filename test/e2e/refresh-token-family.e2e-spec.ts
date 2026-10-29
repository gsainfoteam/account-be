import { PrismaClient } from '@prisma/client';

import { OauthRepository } from '../../src/oauth/oauth.repository';

const prisma = new PrismaClient();
const repository = new OauthRepository(prisma as never);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const familyId = '11111111-1111-4111-8111-111111111111';
let userUuid: string;
let clientUuid: string;

const token = (value: string) => ({
  token: value,
  scopes: ['offline_access'],
  userUuid,
  clientUuid,
  familyId,
});
const familySize = () => prisma.refreshToken.count({ where: { familyId } });

// holds the family lock and inserts a token, as a rotation does, then starts `remove` before committing.
// an unlocked remove finishes before the commit; a locked one waits for it, so the timeout only keeps it moving
async function removeDuringRotation(remove: () => Promise<unknown>) {
  await repository.createRefreshToken(token('presented'));
  let removal: Promise<unknown> = Promise.resolve();
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${familyId}))`;
    await tx.refreshToken.create({
      data: { ...token('next'), expiresAt: new Date(Date.now() + 60_000) },
    });
    removal = remove();
    await Promise.race([removal, sleep(300)]);
  });
  await removal;
  return familySize();
}

describe('refresh token family', () => {
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        password: 'unused',
        name: 'family',
        email: 'refresh-token-family@gm.gist.ac.kr',
        studentId: '20000099',
        phoneNumber: '01000000099',
      },
    });
    const client = await prisma.client.create({
      data: {
        secret: 'unused',
        name: 'family',
        scopes: [],
        optionalScopes: [],
      },
    });
    userUuid = user.uuid;
    clientUuid = client.uuid;
  });

  beforeEach(() => prisma.refreshToken.deleteMany({ where: { familyId } }));

  afterAll(async () => {
    await prisma.client.delete({ where: { uuid: clientUuid } });
    await prisma.user.delete({ where: { uuid: userUuid } });
    await prisma.$disconnect();
  });

  it('rotates once and ends the family when the used token comes back', async () => {
    await repository.createRefreshToken(token('a'));

    await expect(
      repository.rotateRefreshToken('a', familyId, token('b')),
    ).resolves.toBe(true);
    expect(await familySize()).toBe(2);

    await expect(
      repository.rotateRefreshToken('a', familyId, token('c')),
    ).resolves.toBe(false);
    expect(await familySize()).toBe(0);
  });

  it('lets only one of two parallel rotations of the same token win', async () => {
    await repository.createRefreshToken(token('a'));

    const results = await Promise.all([
      repository.rotateRefreshToken('a', familyId, token('b')),
      repository.rotateRefreshToken('a', familyId, token('c')),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await familySize()).toBe(0);
  });

  it('deletes a token that a rotation commits while the family is being deleted', async () => {
    await expect(
      removeDuringRotation(() => repository.deleteRefreshTokenFamily(familyId)),
    ).resolves.toBe(0);
  });

  it('would miss that token without the family lock', async () => {
    await expect(
      removeDuringRotation(() =>
        prisma.refreshToken.deleteMany({ where: { familyId } }),
      ),
    ).resolves.toBe(1);
  });
});
