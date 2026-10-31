import { User } from '@prisma/client';

import { userClaims } from './user-claims';

const user = {
  uuid: 'user-1',
  name: '홍길동',
  profile: null,
  picture: 'https://example.com/a.webp',
  email: 'a@gm.gist.ac.kr',
  studentId: '20240000',
  isIdVerified: true,
  phoneNumber: '01012345678',
  isPhoneNumberVerified: false,
} as User;

describe('userClaims', () => {
  it('puts in the claims of every granted scope', () => {
    expect(
      userClaims(user, [
        'openid',
        'name',
        'picture',
        'student_id',
        'phone_number',
      ]),
    ).toEqual({
      name: '홍길동',
      picture: 'https://example.com/a.webp',
      student_id: '20240000',
      is_student_id_verified: true,
      phone_number: '01012345678',
      is_phone_number_verified: false,
    });
  });

  it('leaves out a claim without a value instead of sending null', () => {
    const claims = userClaims(user, ['profile', 'email']);

    expect(claims).toEqual({ email: 'a@gm.gist.ac.kr' });
    expect('profile' in claims).toBe(false);
  });
});
