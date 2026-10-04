-- Fill verified historical Form 2 dates from the original W804 register.
-- Only rows with an explicit Form 2 date in the source are updated.
UPDATE w804_records SET form2='10 มี.ค. 2569' WHERE number=2;
UPDATE w804_records SET form2='10 มี.ค. 2569' WHERE number=3;
UPDATE w804_records SET form2='11 มี.ค. 2569' WHERE number=4;
UPDATE w804_records SET form2='13 มี.ค. 2569' WHERE number=6;
UPDATE w804_records SET form2='9 มี.ค. 2569' WHERE number=8;
UPDATE w804_records SET form2='16 มี.ค. 2569' WHERE number=9;
UPDATE w804_records SET form2='21 เม.ย. 2569' WHERE number=10;
UPDATE w804_records SET form2='30 เม.ย. 2569' WHERE number=11;
UPDATE w804_records SET form2='26 มิ.ย. 2569' WHERE number IN (12,13,14,15,16);
UPDATE w804_records SET form2='23 ก.ค. 2569' WHERE number IN (18,19);
UPDATE w804_records SET form2='31 ส.ค. 2569' WHERE number IN (24,25,26,27);

INSERT INTO w804_audit(id,record_id,action,before_data,after_data)
SELECT gen_random_uuid(),r.id,'restore-form2-date',NULL,to_jsonb(r)
FROM w804_records r
WHERE r.number IN (2,3,4,6,8,9,10,11,12,13,14,15,16,18,19,24,25,26,27);
