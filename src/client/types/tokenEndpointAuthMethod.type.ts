import { type TokenEndpointAuthMethod as ContractMethod } from '@gsainfoteam/account-contract';
import { TokenEndpointAuthMethod } from '@prisma/client';

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

// discovery advertises the contract's list, so the database enum must hold exactly the same methods
true satisfies Same<TokenEndpointAuthMethod, ContractMethod>;
