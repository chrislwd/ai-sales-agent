DO $$ BEGIN
 CREATE TYPE "public"."actor_type" AS ENUM('ai', 'user', 'system');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."approval_mode" AS ENUM('auto', 'first_only', 'all');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."crm_provider" AS ENUM('hubspot', 'salesforce');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."enrollment_status" AS ENUM('active', 'completed', 'replied', 'bounced', 'unsubscribed', 'paused', 'error');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."lifecycle_status" AS ENUM('new', 'contacted', 'replied', 'meeting_scheduled', 'meeting_completed', 'qualified', 'disqualified', 'nurture');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."meeting_status" AS ENUM('proposed', 'confirmed', 'completed', 'cancelled', 'no_show');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."message_status" AS ENUM('pending', 'scheduled', 'sent', 'delivered', 'bounced', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."reply_intent" AS ENUM('interested', 'request_demo', 'not_now', 'not_relevant', 'using_competitor', 'pricing_concern', 'security_concern', 'referral', 'unsubscribe', 'out_of_office', 'unknown');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."sequence_status" AS ENUM('draft', 'active', 'paused', 'archived');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."step_type" AS ENUM('email', 'wait', 'condition');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."workspace_role" AS ENUM('owner', 'admin', 'manager', 'sdr', 'ae', 'viewer');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_name" text NOT NULL,
	"domain" text,
	"industry" text,
	"country" text,
	"employee_size" integer,
	"revenue_range" text,
	"tech_stack" text[] DEFAULT '{}' NOT NULL,
	"funding_stage" text,
	"linkedin_url" text,
	"website_summary" text,
	"score" real DEFAULT 0 NOT NULL,
	"score_breakdown" jsonb,
	"owner_id" uuid,
	"source" text DEFAULT 'manual' NOT NULL,
	"crm_account_id" text,
	"crm_provider" "crm_provider",
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activity_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"object_type" text NOT NULL,
	"object_id" uuid NOT NULL,
	"activity_type" text NOT NULL,
	"actor_type" "actor_type" DEFAULT 'system' NOT NULL,
	"actor_id" uuid,
	"payload" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text DEFAULT '' NOT NULL,
	"email" text NOT NULL,
	"title" text,
	"seniority" text,
	"job_function" text,
	"linkedin_url" text,
	"country" text,
	"phone" text,
	"score" real DEFAULT 0 NOT NULL,
	"lifecycle_status" "lifecycle_status" DEFAULT 'new' NOT NULL,
	"owner_id" uuid,
	"unsubscribed" boolean DEFAULT false NOT NULL,
	"unsubscribed_at" timestamp,
	"do_not_contact" boolean DEFAULT false NOT NULL,
	"crm_contact_id" text,
	"crm_provider" "crm_provider",
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider" "crm_provider" NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"token_expires_at" timestamp,
	"portal_id" text,
	"instance_url" text,
	"field_mappings" jsonb DEFAULT '{}' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_sync_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"provider" text DEFAULT 'google' NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"token_expires_at" timestamp,
	"smtp_host" text,
	"smtp_port" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"daily_sent_count" integer DEFAULT 0 NOT NULL,
	"daily_limit_reset_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "icp_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"industries" text[] DEFAULT '{}' NOT NULL,
	"countries" text[] DEFAULT '{}' NOT NULL,
	"employee_size_min" integer,
	"employee_size_max" integer,
	"revenue_size_min" integer,
	"revenue_size_max" integer,
	"tech_stack" text[] DEFAULT '{}' NOT NULL,
	"seniority_levels" text[] DEFAULT '{}' NOT NULL,
	"job_functions" text[] DEFAULT '{}' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "workspace_role" DEFAULT 'sdr' NOT NULL,
	"token" text NOT NULL,
	"invited_by" uuid NOT NULL,
	"expires_at" timestamp NOT NULL,
	"accepted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"scheduled_at" timestamp,
	"duration_minutes" integer DEFAULT 30 NOT NULL,
	"status" "meeting_status" DEFAULT 'proposed' NOT NULL,
	"source" text DEFAULT 'auto' NOT NULL,
	"calendar_event_id" text,
	"pre_call_brief" text,
	"meeting_link" text,
	"notes" text,
	"enrollment_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"sequence_step_id" uuid NOT NULL,
	"email_account_id" uuid,
	"channel" text DEFAULT 'email' NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"generated_by_ai" boolean DEFAULT false NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp,
	"status" "message_status" DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp,
	"opened_at" timestamp,
	"clicked_at" timestamp,
	"bounced_at" timestamp,
	"external_message_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"body" text NOT NULL,
	"raw_email" text,
	"intent" "reply_intent" DEFAULT 'unknown' NOT NULL,
	"confidence_score" real DEFAULT 0 NOT NULL,
	"requires_human_review" boolean DEFAULT false NOT NULL,
	"human_reviewed_by" uuid,
	"human_reviewed_at" timestamp,
	"action_taken" text,
	"received_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sequence_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sequence_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"enrolled_by" uuid,
	"status" "enrollment_status" DEFAULT 'active' NOT NULL,
	"current_step_position" integer DEFAULT 0 NOT NULL,
	"next_send_at" timestamp,
	"completed_at" timestamp,
	"paused_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sequence_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sequence_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"step_type" "step_type" DEFAULT 'email' NOT NULL,
	"delay_days" integer DEFAULT 0 NOT NULL,
	"condition" jsonb,
	"template_subject" text,
	"template_body" text,
	"approval_mode" "approval_mode" DEFAULT 'auto' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "sequence_status" DEFAULT 'draft' NOT NULL,
	"icp_config_id" uuid,
	"daily_send_limit" integer DEFAULT 50 NOT NULL,
	"send_window_start" text DEFAULT '08:00' NOT NULL,
	"send_window_end" text DEFAULT '18:00' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"default_approval_mode" "approval_mode" DEFAULT 'auto' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"avatar_url" text,
	"google_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workspace_members" (
	"user_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"role" "workspace_role" DEFAULT 'sdr' NOT NULL,
	"invited_by" uuid,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"brand_voice" text,
	"company_description" text,
	"logo_url" text,
	"daily_send_limit" integer DEFAULT 200 NOT NULL,
	"send_window_start" text DEFAULT '08:00' NOT NULL,
	"send_window_end" text DEFAULT '18:00' NOT NULL,
	"suppression_domains" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "accounts" ADD CONSTRAINT "accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "accounts" ADD CONSTRAINT "accounts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contacts" ADD CONSTRAINT "contacts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contacts" ADD CONSTRAINT "contacts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contacts" ADD CONSTRAINT "contacts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_connections" ADD CONSTRAINT "crm_connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_accounts" ADD CONSTRAINT "email_accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_accounts" ADD CONSTRAINT "email_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "icp_configs" ADD CONSTRAINT "icp_configs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invitations" ADD CONSTRAINT "invitations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meetings" ADD CONSTRAINT "meetings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meetings" ADD CONSTRAINT "meetings_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meetings" ADD CONSTRAINT "meetings_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meetings" ADD CONSTRAINT "meetings_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meetings" ADD CONSTRAINT "meetings_enrollment_id_sequence_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."sequence_enrollments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_enrollment_id_sequence_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."sequence_enrollments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_sequence_step_id_sequence_steps_id_fk" FOREIGN KEY ("sequence_step_id") REFERENCES "public"."sequence_steps"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_email_account_id_email_accounts_id_fk" FOREIGN KEY ("email_account_id") REFERENCES "public"."email_accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "replies" ADD CONSTRAINT "replies_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "replies" ADD CONSTRAINT "replies_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "replies" ADD CONSTRAINT "replies_enrollment_id_sequence_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."sequence_enrollments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "replies" ADD CONSTRAINT "replies_human_reviewed_by_users_id_fk" FOREIGN KEY ("human_reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sequence_enrollments" ADD CONSTRAINT "sequence_enrollments_sequence_id_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."sequences"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sequence_enrollments" ADD CONSTRAINT "sequence_enrollments_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sequence_enrollments" ADD CONSTRAINT "sequence_enrollments_enrolled_by_users_id_fk" FOREIGN KEY ("enrolled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sequence_steps" ADD CONSTRAINT "sequence_steps_sequence_id_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."sequences"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sequences" ADD CONSTRAINT "sequences_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sequences" ADD CONSTRAINT "sequences_icp_config_id_icp_configs_id_fk" FOREIGN KEY ("icp_config_id") REFERENCES "public"."icp_configs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sequences" ADD CONSTRAINT "sequences_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accounts_workspace_idx" ON "accounts" ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accounts_domain_idx" ON "accounts" ("workspace_id","domain");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_logs_object_idx" ON "activity_logs" ("object_type","object_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_logs_workspace_idx" ON "activity_logs" ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_logs_created_idx" ON "activity_logs" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_workspace_idx" ON "contacts" ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_email_workspace_idx" ON "contacts" ("workspace_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "crm_connections_workspace_provider_idx" ON "crm_connections" ("workspace_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "invitations_token_idx" ON "invitations" ("token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_contact_idx" ON "messages" ("contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_status_idx" ON "messages" ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "refresh_tokens_token_idx" ON "refresh_tokens" ("token");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "enrollments_unique_idx" ON "sequence_enrollments" ("sequence_id","contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "enrollments_next_send_idx" ON "sequence_enrollments" ("next_send_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sequence_steps_position_idx" ON "sequence_steps" ("sequence_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_idx" ON "users" ("email");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_members_pk" ON "workspace_members" ("user_id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workspaces_slug_idx" ON "workspaces" ("slug");