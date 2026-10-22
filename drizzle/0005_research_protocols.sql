CREATE TABLE `research_records` (
	`user_id` text NOT NULL,
	`id` text NOT NULL,
	`track` text NOT NULL,
	`protocol_json` text NOT NULL,
	`protocol_sha` text NOT NULL,
	`frozen_at` integer NOT NULL,
	`opened_at` integer NOT NULL,
	`report_json` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `id`)
);
