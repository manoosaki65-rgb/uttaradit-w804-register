-- Restore verified Form 2 dates for legacy V1-V6 records.
UPDATE w804_records SET form2='27 พ.ค. 2569' WHERE upper(trim(legacy_code))='V1';
UPDATE w804_records SET form2='20 พ.ค. 2569' WHERE upper(trim(legacy_code)) IN ('V2','V3');
UPDATE w804_records SET form2='30 เม.ย. 2569' WHERE upper(trim(legacy_code)) IN ('V4','V5');
UPDATE w804_records SET form2='26 มิ.ย. 2569' WHERE upper(trim(legacy_code))='V6';

INSERT INTO w804_audit(id,record_id,action,before_data,after_data)
SELECT gen_random_uuid(),r.id,'restore-form2-date',NULL,to_jsonb(r)
FROM w804_records r
WHERE upper(trim(coalesce(r.legacy_code,''))) IN ('V1','V2','V3','V4','V5','V6');
