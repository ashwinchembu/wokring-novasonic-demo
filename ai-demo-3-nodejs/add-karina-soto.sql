-- Add Dr. Karina Soto to the HCP table in Redshift
INSERT INTO hcp_table (id, name, account_id, account_name)
VALUES ('0013K000013ez2hQAA', 'Dr. Karina Soto', 'ACC017', 'Valley Medical Center')
ON CONFLICT (id) DO NOTHING;

-- Verify
SELECT * FROM hcp_table WHERE name LIKE '%Soto%';

