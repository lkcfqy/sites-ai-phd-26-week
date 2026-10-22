ALTER TABLE `attempts` ADD `content_version` text DEFAULT 'v1' NOT NULL;--> statement-breakpoint
CREATE INDEX `attempts_user_created` ON `attempts` (`user_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `checkpoints` ADD `content_version` text DEFAULT 'v1' NOT NULL;--> statement-breakpoint
ALTER TABLE `progress` ADD `assistance` text DEFAULT 'unrecorded' NOT NULL;--> statement-breakpoint
ALTER TABLE `progress` ADD `practice_evidence` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `progress` ADD `content_version` text DEFAULT 'v1' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `assistance` text DEFAULT 'unrecorded' NOT NULL;