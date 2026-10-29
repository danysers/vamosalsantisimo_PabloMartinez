ALTER TYPE "public"."email_kind" ADD VALUE 'lot_changed';--> statement-breakpoint
CREATE TABLE "workshop_lot_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workshop_id" uuid NOT NULL,
	"from_lot" integer NOT NULL,
	"to_lot" integer NOT NULL,
	"threshold" integer NOT NULL,
	"paid_places" integer NOT NULL,
	"from_amount_minor" integer NOT NULL,
	"to_amount_minor" integer NOT NULL,
	"to_email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lot_changes_forward_only" CHECK ("workshop_lot_changes"."from_lot" BETWEEN 1 AND 2 AND "workshop_lot_changes"."to_lot" = "workshop_lot_changes"."from_lot" + 1),
	CONSTRAINT "lot_changes_valid_count" CHECK ("workshop_lot_changes"."threshold" > 0 AND "workshop_lot_changes"."paid_places" >= "workshop_lot_changes"."threshold"),
	CONSTRAINT "lot_changes_positive_prices" CHECK ("workshop_lot_changes"."from_amount_minor" > 0 AND "workshop_lot_changes"."to_amount_minor" > 0)
);
--> statement-breakpoint
ALTER TABLE "email_outbox" DROP CONSTRAINT "email_outbox_one_subject";--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "lot_change_id" uuid;--> statement-breakpoint
ALTER TABLE "workshop_lots" ADD COLUMN "advance_after" integer;--> statement-breakpoint
ALTER TABLE "workshops" ADD COLUMN "lot_automation_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workshops" ADD COLUMN "lot_notification_email" text;--> statement-breakpoint
ALTER TABLE "workshop_lot_changes" ADD CONSTRAINT "workshop_lot_changes_workshop_id_workshops_id_fk" FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lot_changes_by_workshop" ON "workshop_lot_changes" USING btree ("workshop_id","created_at");--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_lot_change_id_workshop_lot_changes_id_fk" FOREIGN KEY ("lot_change_id") REFERENCES "public"."workshop_lot_changes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_one_subject" CHECK ((
    ("email_outbox"."registration_id" IS NOT NULL)::integer +
    ("email_outbox"."settlement_reminder_id" IS NOT NULL)::integer +
    ("email_outbox"."lot_change_id" IS NOT NULL)::integer = 1
  ));--> statement-breakpoint
ALTER TABLE "workshop_lots" ADD CONSTRAINT "workshop_lots_advance_after" CHECK ("workshop_lots"."advance_after" IS NULL OR ("workshop_lots"."number" < 3 AND "workshop_lots"."advance_after" BETWEEN 1 AND 1000000));
--> statement-breakpoint
-- Count people covered by a fully approved payment, not payment attempts or
-- money received. A paid group covers each member, including its promotion.
-- Ventanilla, unpaid registrations, assistance and historical trials do not
-- consume a pricing lot. Reversed payments no longer contribute to the count.
CREATE FUNCTION workshop_lot_paid_places(target_workshop uuid, target_lot integer)
RETURNS integer LANGUAGE sql VOLATILE AS $$
  SELECT count(DISTINCT r.id)::integer
  FROM registrations r
  JOIN payment_allocations a ON a.registration_id=r.id
  JOIN payment_attempts p ON p.id=a.attempt_id
  WHERE r.workshop_id=target_workshop AND a.lot_number=target_lot
    AND r.status='confirmed' AND registration_is_current(r.id)
    AND p.source IN ('mercado_pago','bank_transfer','manual')
    AND p.status='approved' AND p.amount_minor IS NOT NULL
    AND p.paid_amount_minor >= p.amount_minor
$$;
--> statement-breakpoint
-- All callers serialize on the workshop row. The active lot, history, audit
-- and durable notification commit together. Repeated workers cannot announce
-- the same transition twice, and refunds never move the active lot backwards.
CREATE FUNCTION advance_workshop_lot(target_workshop uuid) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  ws workshops%ROWTYPE;
  limit_count integer;
  place_count integer;
  old_price integer;
  next_price integer;
  change_id uuid;
BEGIN
  SELECT * INTO ws FROM workshops WHERE id=target_workshop FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT ws.lot_automation_enabled OR NOT ws.registration_open OR ws.starts_at<=now()
    OR nullif(trim(ws.lot_notification_email),'') IS NULL THEN RETURN ws.active_lot; END IF;
  WHILE ws.active_lot < 3 LOOP
    SELECT advance_after,amount_minor INTO limit_count,old_price
      FROM workshop_lots WHERE workshop_id=ws.id AND number=ws.active_lot;
    IF limit_count IS NULL THEN EXIT; END IF;
    place_count := workshop_lot_paid_places(ws.id,ws.active_lot);
    IF place_count < limit_count THEN EXIT; END IF;
    SELECT amount_minor INTO next_price FROM workshop_lots WHERE workshop_id=ws.id AND number=ws.active_lot+1;
    IF NOT FOUND THEN EXIT; END IF;
    INSERT INTO workshop_lot_changes(workshop_id,from_lot,to_lot,threshold,paid_places,from_amount_minor,to_amount_minor,to_email)
      VALUES(ws.id,ws.active_lot,ws.active_lot+1,limit_count,place_count,old_price,next_price,ws.lot_notification_email)
      RETURNING id INTO change_id;
    UPDATE workshops SET active_lot=ws.active_lot+1 WHERE id=ws.id;
    INSERT INTO email_outbox(dedupe_key,kind,to_email,lot_change_id)
      VALUES('lot-change:'||change_id::text,'lot_changed',ws.lot_notification_email,change_id);
    INSERT INTO audit_log(action,subject_id,changes)
      VALUES('pricing.automatic_lot_changed',ws.id,jsonb_build_object(
        'from',ws.active_lot,'to',ws.active_lot+1,'paidPlaces',place_count,
        'threshold',limit_count,'changeId',change_id));
    ws.active_lot := ws.active_lot+1;
  END LOOP;
  RETURN ws.active_lot;
END; $$;
