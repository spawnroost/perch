CREATE TABLE "price_watches" (
	"user_id" text NOT NULL,
	"igdb_id" integer NOT NULL,
	"target_price" numeric(8, 2),
	"last_notified_price" numeric(8, 2),
	"last_notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_watches_user_id_igdb_id_pk" PRIMARY KEY("user_id","igdb_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "price_digest_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "price_watches" ADD CONSTRAINT "price_watches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_watches" ADD CONSTRAINT "price_watches_igdb_id_games_igdb_id_fk" FOREIGN KEY ("igdb_id") REFERENCES "public"."games"("igdb_id") ON DELETE cascade ON UPDATE no action;