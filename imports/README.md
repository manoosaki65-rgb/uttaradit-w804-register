# Import Master ว804 001–036

ยังไม่มีการ Import Master และไม่มีข้อมูลตัวอย่างแทน Master ในระบบใหม่

1. Download the CSV header template from `/api/import/template` or use a single-sheet XLSX/JSON array with the same keys.
2. Fill actual, reviewed values from the original Excel for 001–031, and PDFs B1-032 through B1-036 for 032–036. Do not fabricate missing values. The original application source snapshot is for UI reference only and is not an authoritative replacement for the Excel/PDF Master.
3. Supported fields: `no,date,unit,useLocation,item,amount,form2,inventoryNo,status,cancelReason,note,sourceEvidence`.
4. `sourceEvidence` must identify the original source file. For 032–036 it must include the corresponding `B1-032` through `B1-036`. Data transcribed from PDFs is reviewed and provided in CSV/JSON/XLSX; PDF OCR is not enabled.
5. Required: number 001–036, requesting unit, item, amount >0 and <=50000, source evidence. Dates may be blank if unknown; supplied dates must be valid `YYYY-MM-DD` or Thai short-date text. No invented dates.
6. Upload the file in **Import Master**, review every field and any errors, then explicitly confirm. Partial batches are supported, so Excel 001–031 can be imported before the reviewed PDF records 032–036.
7. 035 and 036 are forced to cancelled, with “ยกเลิก” in the note. They cannot be restored or reused.
8. Imports never overwrite existing records. Identical existing records are skipped; conflicting rows reject the entire batch. The transaction revalidates immediately before insertion. New issues stay at 037 or beyond regardless of partial import progress.
9. Attach the actual PDFs to the relevant Form 1/Form 2 slots after import. New records can attach Form 1 atomically at issue time.

The downloaded template contains only column headers, no placeholder rows or invented Master records.
