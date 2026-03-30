CREATE UNIQUE INDEX idx_users_single_owner ON users ((true)) WHERE role = 'owner';
