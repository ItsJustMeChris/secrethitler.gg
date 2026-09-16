CREATE TABLE `room_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`player_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`code`) REFERENCES `rooms`(`code`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `connections_room_expiry` ON `room_connections` (`code`,`expires_at`);--> statement-breakpoint
ALTER TABLE `rooms` ADD `close_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `rooms_close_at` ON `rooms` (`close_at`);
--> statement-breakpoint
-- Retire pre-WebSocket rooms: they have no connection leases and cannot safely
-- participate in the new lifecycle. Session cookies remain valid for new rooms.
DELETE FROM rooms;
