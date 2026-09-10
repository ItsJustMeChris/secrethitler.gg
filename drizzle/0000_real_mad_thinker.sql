CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `limits_expires` ON `rate_limits` (`expires`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rooms_updated` ON `rooms` (`updated_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`hash` text PRIMARY KEY NOT NULL,
	`id` text NOT NULL,
	`expires` integer NOT NULL,
	`last_seen` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_id_unique` ON `sessions` (`id`);--> statement-breakpoint
CREATE INDEX `sessions_expires` ON `sessions` (`expires`);