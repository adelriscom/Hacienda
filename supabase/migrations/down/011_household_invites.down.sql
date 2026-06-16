-- DOWN 011 · Remove household invite flow
-- WARNING: drops household_invites and all its data.
DROP FUNCTION IF EXISTS create_my_household(text, text);
DROP FUNCTION IF EXISTS join_household_by_code(text, text);
DROP FUNCTION IF EXISTS create_household_invite();
DROP TABLE IF EXISTS household_invites;
