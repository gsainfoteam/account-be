-- Rename 'profile' scope to 'name' in client table
UPDATE "client"
SET 
  "scopes" = ARRAY(SELECT DISTINCT e FROM unnest(array_replace("scopes", 'profile', 'name')) AS e),
  "optional_scopes" = ARRAY(SELECT DISTINCT e FROM unnest(array_replace("optional_scopes", 'profile', 'name')) AS e);

-- Rename 'profile' scope to 'name' in consent table
UPDATE "consent"
SET "scopes" = ARRAY(SELECT DISTINCT e FROM unnest(array_replace("scopes", 'profile', 'name')) AS e);

-- Rename 'profile' scope to 'name' in refresh_token table
UPDATE "refresh_token"
SET "scopes" = ARRAY(SELECT DISTINCT e FROM unnest(array_replace("scopes", 'profile', 'name')) AS e);
