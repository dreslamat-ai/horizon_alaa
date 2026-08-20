CREATE TABLE `alaa_conversations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`alaa_customer_id` integer NOT NULL,
	`staff_id` integer NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`alaa_customer_id`) REFERENCES `alaa_customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`staff_id`) REFERENCES `horizon_staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `alaa_customers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_name_ar` text NOT NULL,
	`company_name_en` text,
	`erp_url` text NOT NULL,
	`erp_username` text NOT NULL,
	`erp_password_enc` text NOT NULL,
	`plan_id` integer NOT NULL,
	`subscription_status` text DEFAULT 'trial' NOT NULL,
	`subscription_end_date` text NOT NULL,
	`credits_balance` integer DEFAULT 0 NOT NULL,
	`monthly_credits_allowance` integer NOT NULL,
	`credits_reset_at` text DEFAULT (current_timestamp) NOT NULL,
	`created_by_staff_id` integer NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `alaa_plans`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_staff_id`) REFERENCES `horizon_staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `alaa_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_id` integer NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`tool_results_json` text,
	`credits_cost` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `alaa_conversations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `alaa_plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name_ar` text NOT NULL,
	`monthly_price_sar` real DEFAULT 0 NOT NULL,
	`monthly_credits_allowance` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `horizon_staff` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'support' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `horizon_staff_email_unique` ON `horizon_staff` (`email`);