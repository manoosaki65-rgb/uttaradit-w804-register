-- Add legacy V1-V6 records in their original register positions and restore Form 2 dates.
ALTER TABLE w804_records ADD COLUMN IF NOT EXISTS legacy_code text NOT NULL DEFAULT '';
ALTER TABLE w804_records ADD COLUMN IF NOT EXISTS source_order numeric(8,2);

UPDATE w804_records SET source_order=number*10 WHERE source_order IS NULL AND legacy_code='';

INSERT INTO w804_records(id,number,date,unit,use_location,item,amount,form2,note,source_evidence,legacy_code,source_order)
VALUES
(gen_random_uuid(),1001,'30 เม.ย. 2569','กลุ่มงานโครงสร้างพื้นฐานฯ','กระดูกชาย พิเศษ 2','เครื่องปรับอากาศขนาด 18,000 BTU',27000,'27 พ.ค. 2569','เลขพิเศษเดิม','ทะเบียน ว804 เดิม','V1',105),
(gen_random_uuid(),1002,'27 เม.ย. 2569','กลุ่มงานโครงสร้างพื้นฐานฯ','หลังคลอด - มะลิวัลย์','เครื่องปรับอากาศขนาด 18,000 BTU',33000,'20 พ.ค. 2569','เลขพิเศษเดิม','ทะเบียน ว804 เดิม','V2',106),
(gen_random_uuid(),1003,'27 เม.ย. 2569','กลุ่มงานโครงสร้างพื้นฐานฯ','หลังคลอด - ชาทอง','เครื่องปรับอากาศขนาด 25,000 BTU',33000,'20 พ.ค. 2569','เลขพิเศษเดิม','ทะเบียน ว804 เดิม','V3',107),
(gen_random_uuid(),1004,'30 เม.ย. 2569','กลุ่มงานโครงสร้างพื้นฐานฯ','สำรองไฟโทรศัพท์','แบตเตอรี่ขนาด 12V 7 A',9790,'30 เม.ย. 2569','เลขพิเศษเดิม','ทะเบียน ว804 เดิม','V4',108),
(gen_random_uuid(),1005,'30 เม.ย. 2569','กลุ่มงานโครงสร้างพื้นฐานฯ','เครื่องกำเนิดไฟฟ้า','Phase Protection 380v 4w VPM-03-D',9000,'30 เม.ย. 2569','เลขพิเศษเดิม','ทะเบียน ว804 เดิม','V5',109),
(gen_random_uuid(),1006,'25 พ.ค. 2569','กลุ่มงานโครงสร้างพื้นฐานฯ','หผป.แยกโรค','ถาดรองน้ำสแนเลส 0.5*1*.005, ถาดรองน้ำสแนเลส 0.5*0.6*.005',9000,'26 มิ.ย. 2569','เลขพิเศษเดิม','ทะเบียน ว804 เดิม','V6',195)
ON CONFLICT (number) DO UPDATE SET form2=EXCLUDED.form2,legacy_code=EXCLUDED.legacy_code,source_order=EXCLUDED.source_order;

UPDATE w804_records SET source_order=number*10 WHERE legacy_code='' AND number BETWEEN 1 AND 36;
