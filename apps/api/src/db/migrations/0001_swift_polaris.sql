DO $$ BEGIN
 CREATE TYPE "public"."template_category" AS ENUM('cold_outbound', 'follow_up', 'breakup', 're_engagement', 'post_demo', 'referral', 'custom');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" "template_category" DEFAULT 'custom' NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"variables" text[] DEFAULT '{}' NOT NULL,
	"is_shared" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX IF EXISTS "sequence_steps_position_idx";--> statement-breakpoint
ALTER TABLE "sequence_steps" ADD COLUMN "variant_group" text;--> statement-breakpoint
ALTER TABLE "sequence_steps" ADD COLUMN "variant_label" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_templates_workspace_idx" ON "email_templates" ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_templates_category_idx" ON "email_templates" ("workspace_id","category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sequence_steps_position_idx" ON "sequence_steps" ("sequence_id","position");