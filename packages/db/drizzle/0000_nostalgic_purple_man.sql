CREATE TABLE "deck_compat" (
	"steam_app_id" integer PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deck_compat_category_chk" CHECK ("deck_compat"."category" in ('verified', 'playable', 'unsupported', 'unknown'))
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"platform_ids" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"gpu_name" text,
	"gpu_score" integer,
	"cpu_name" text,
	"cpu_score" integer,
	"ram_gb" real,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"igdb_id" integer NOT NULL,
	"kind" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_kind_chk" CHECK ("feedback"."kind" in ('up', 'down', 'played', 'not_interested'))
);
--> statement-breakpoint
CREATE TABLE "game_requirements" (
	"igdb_id" integer NOT NULL,
	"source" text NOT NULL,
	"min_gpu_score" integer,
	"min_cpu_score" integer,
	"min_ram_gb" real,
	"rec_gpu_score" integer,
	"rec_cpu_score" integer,
	"rec_ram_gb" real,
	"raw" text,
	"parsed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_requirements_igdb_id_source_pk" PRIMARY KEY("igdb_id","source"),
	CONSTRAINT "game_requirements_source_chk" CHECK ("game_requirements"."source" in ('steam', 'pcgw', 'llm'))
);
--> statement-breakpoint
CREATE TABLE "games" (
	"igdb_id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"cover_url" text,
	"first_release" timestamp with time zone,
	"genres" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"themes" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"keywords" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"perspectives" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"game_modes" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"platforms" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"similar_ids" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"rating" real,
	"rating_count" integer,
	"steam_app_id" integer,
	"vocab" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"igdb_id" integer NOT NULL,
	"platform" text NOT NULL,
	"hours_played" real,
	"last_played" timestamp with time zone,
	"status" text DEFAULT 'backlog' NOT NULL,
	"owned" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "library_entries_status_chk" CHECK ("library_entries"."status" in ('playing', 'finished', 'dropped', 'backlog'))
);
--> statement-breakpoint
CREATE TABLE "recommendation_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"device_id" uuid,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reasons" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"built_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "taste_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"vocab" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"genres" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"pacing" text,
	"built_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_to_beat" (
	"igdb_id" integer PRIMARY KEY NOT NULL,
	"hastily_seconds" integer,
	"normally_seconds" integer,
	"completely_seconds" integer,
	"count" integer,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"plan" text DEFAULT 'free' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_igdb_id_games_igdb_id_fk" FOREIGN KEY ("igdb_id") REFERENCES "public"."games"("igdb_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_requirements" ADD CONSTRAINT "game_requirements_igdb_id_games_igdb_id_fk" FOREIGN KEY ("igdb_id") REFERENCES "public"."games"("igdb_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_entries" ADD CONSTRAINT "library_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_entries" ADD CONSTRAINT "library_entries_igdb_id_games_igdb_id_fk" FOREIGN KEY ("igdb_id") REFERENCES "public"."games"("igdb_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_cache" ADD CONSTRAINT "recommendation_cache_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_cache" ADD CONSTRAINT "recommendation_cache_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taste_profiles" ADD CONSTRAINT "taste_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_to_beat" ADD CONSTRAINT "time_to_beat_igdb_id_games_igdb_id_fk" FOREIGN KEY ("igdb_id") REFERENCES "public"."games"("igdb_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "devices_user_idx" ON "devices" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_one_default_idx" ON "devices" USING btree ("user_id") WHERE "devices"."is_default";--> statement-breakpoint
CREATE INDEX "feedback_user_game_idx" ON "feedback" USING btree ("user_id","igdb_id");--> statement-breakpoint
CREATE INDEX "games_steam_app_id_idx" ON "games" USING btree ("steam_app_id");--> statement-breakpoint
CREATE INDEX "games_slug_idx" ON "games" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "library_entries_user_game_platform_idx" ON "library_entries" USING btree ("user_id","igdb_id","platform");--> statement-breakpoint
CREATE INDEX "library_entries_user_status_idx" ON "library_entries" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "recommendation_cache_user_idx" ON "recommendation_cache" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recommendation_cache_user_device_idx" ON "recommendation_cache" USING btree ("user_id","device_id") WHERE "recommendation_cache"."device_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "recommendation_cache_user_nodevice_idx" ON "recommendation_cache" USING btree ("user_id") WHERE "recommendation_cache"."device_id" is null;