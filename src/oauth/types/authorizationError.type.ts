export type AuthorizeError =
  | 'invalid_request' // the request is missing a required parameter
  | 'unauthorized_client' // the client is not authorized to request an authorization code using this method
  | 'access_denied' // the resource owner or authorization server denied the request
  | 'unsupported_response_type' // the authorization server does not support obtaining an authorization code using this method
  | 'invalid_scope' // the requested scope is invalid, unknown, or malformed
  | 'server_error' // the authorization server encountered an unexpected condition that prevented it from fulfilling the request
  | 'temporarily_unavailable' // the authorization server is currently unable to handle the request due to a temporary overloading or maintenance of the server
  | 'login_required' // prompt=none, and the user is not logged in (OIDC Core 3.1.2.6)
  | 'consent_required' // prompt=none, and the user has not consented to the requested scopes
  | 'interaction_required'; // prompt=none, and the request needs some other user interaction
