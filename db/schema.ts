import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const rooms = sqliteTable(
  'rooms',
  {
    code: text('code').primaryKey(),
    state: text('state').notNull(),
    revision: integer('revision').notNull().default(0),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [index('rooms_updated').on(table.updatedAt)],
);
export const sessions = sqliteTable(
  'sessions',
  {
    hash: text('hash').primaryKey(),
    id: text('id').notNull().unique(),
    expires: integer('expires').notNull(),
    lastSeen: integer('last_seen').notNull(),
  },
  (table) => [index('sessions_expires').on(table.expires)],
);
export const limits = sqliteTable(
  'rate_limits',
  {
    key: text('key').primaryKey(),
    count: integer('count').notNull(),
    expires: integer('expires').notNull(),
  },
  (table) => [index('limits_expires').on(table.expires)],
);
