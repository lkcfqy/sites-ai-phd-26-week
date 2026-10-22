CREATE TABLE `attempts` (
	`user_id` text NOT NULL,
	`id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`score` integer NOT NULL,
	`mode` text NOT NULL,
	`answers` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`hours` integer DEFAULT 4 NOT NULL,
	`track` text DEFAULT 'undecided' NOT NULL,
	`start_date` text NOT NULL,
	`diagnostic` text DEFAULT '{}' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `progress` (
	`user_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`completed` integer DEFAULT 0 NOT NULL,
	`practiced` integer DEFAULT 0 NOT NULL,
	`score` integer DEFAULT 0 NOT NULL,
	`best_score` integer DEFAULT 0 NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`answers` text DEFAULT '[]' NOT NULL,
	`review_step` integer DEFAULT 0 NOT NULL,
	`next_review` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `lesson_id`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`user_id` text NOT NULL,
	`week` integer NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`checks` text DEFAULT '[]' NOT NULL,
	`submitted` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `week`)
);
