export const ClientScopeList = [
  'profile',
  'name',
  'picture',
  'email',
  'phone_number',
  'student_id',
] as const;
export type ClientScopeType = (typeof ClientScopeList)[number];

export function isClientScope(value: string): value is ClientScopeType {
  return ClientScopeList.some((scope) => scope === value);
}
