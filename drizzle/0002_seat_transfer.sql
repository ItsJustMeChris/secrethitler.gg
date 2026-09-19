ALTER TABLE `sessions` ADD `transfer_hash` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `transfer_code` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `transfer_expires` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_transfer_hash_unique` ON `sessions` (`transfer_hash`);