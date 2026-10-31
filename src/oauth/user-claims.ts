import { SCOPE_CLAIMS, type UserClaims } from '@gsainfoteam/account-contract';
import { User } from '@prisma/client';
import { isClientScope } from 'src/client/types/clientScopes.type';

const CLAIM_VALUES: {
  [K in keyof UserClaims]-?: (user: User) => UserClaims[K] | null;
} = {
  name: (user) => user.name,
  profile: (user) => user.profile,
  picture: (user) => user.picture,
  email: (user) => user.email,
  student_id: (user) => user.studentId,
  is_student_id_verified: (user) => user.isIdVerified,
  phone_number: (user) => user.phoneNumber,
  is_phone_number_verified: (user) => user.isPhoneNumberVerified,
};

/**
 * the claims of the granted scopes, shared by the id_token and userinfo.
 * a claim without a value is left out rather than sent as null (OIDC Core 5.3.2).
 */
export function userClaims(
  user: User,
  scopes: readonly string[],
): Partial<UserClaims> {
  const claims: Partial<Record<keyof UserClaims, unknown>> = {};
  for (const scope of scopes.filter(isClientScope)) {
    for (const claim of SCOPE_CLAIMS[scope]) {
      const value = CLAIM_VALUES[claim](user);
      if (value !== null) claims[claim] = value;
    }
  }
  return claims as Partial<UserClaims>;
}
