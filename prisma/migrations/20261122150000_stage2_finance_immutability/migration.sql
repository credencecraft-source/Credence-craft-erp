-- Stage 2.4: posted and locked finance mutation immutability.
CREATE OR REPLACE FUNCTION prevent_posted_finance_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  old_status text;
  new_status text;
  parent_status text;
BEGIN
  IF TG_TABLE_NAME = 'central_finance_transactions' THEN
    old_status := OLD.status::text;
    new_status := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.status::text END;
    IF TG_OP = 'DELETE' AND old_status IN ('APPROVED', 'POSTED', 'LOCKED', 'REVERSED') THEN
      RAISE EXCEPTION 'approved or posted finance transactions cannot be deleted';
    END IF;
    IF TG_OP = 'UPDATE' AND old_status IN ('POSTED', 'LOCKED') THEN
      IF NEW.status::text NOT IN ('LOCKED', 'REVERSED') THEN
        RAISE EXCEPTION 'posted or locked finance transactions permit only LOCK or REVERSE transitions';
      END IF;
      IF new_status IN ('LOCKED', 'REVERSED')
         AND ROW(NEW.document_type, NEW.document_number, NEW.document_date, NEW.source_id,
                 NEW.entity_id, NEW.party_id, NEW.party_name, NEW.subtotal,
                 NEW.taxable_amount, NEW.cgst_amount, NEW.sgst_amount, NEW.igst_amount,
                 NEW.other_tax_amount, NEW.total_tax_amount, NEW.total_amount)
             IS DISTINCT FROM
             ROW(OLD.document_type, OLD.document_number, OLD.document_date, OLD.source_id,
                 OLD.entity_id, OLD.party_id, OLD.party_name, OLD.subtotal,
                 OLD.taxable_amount, OLD.cgst_amount, OLD.sgst_amount, OLD.igst_amount,
                 OLD.other_tax_amount, OLD.total_tax_amount, OLD.total_amount) THEN
        RAISE EXCEPTION 'posted or locked finance fields cannot be changed';
      END IF;
    END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN
      SELECT status::text INTO parent_status
      FROM "central_finance_transactions" WHERE "id" = OLD.transaction_id;
    ELSE
      SELECT status::text INTO parent_status
      FROM "central_finance_transactions" WHERE "id" = NEW.transaction_id;
    END IF;
    IF parent_status IN ('APPROVED', 'POSTED', 'LOCKED', 'REVERSED') THEN
      RAISE EXCEPTION 'finance transaction lines cannot mutate after approval';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS "central_finance_transactions_mutation_guard" ON "central_finance_transactions";
CREATE TRIGGER "central_finance_transactions_mutation_guard"
BEFORE UPDATE OR DELETE ON "central_finance_transactions"
FOR EACH ROW EXECUTE FUNCTION prevent_posted_finance_mutation();

DROP TRIGGER IF EXISTS "central_finance_transaction_lines_mutation_guard" ON "central_finance_transaction_lines";
CREATE TRIGGER "central_finance_transaction_lines_mutation_guard"
BEFORE UPDATE OR DELETE ON "central_finance_transaction_lines"
FOR EACH ROW EXECUTE FUNCTION prevent_posted_finance_mutation();
