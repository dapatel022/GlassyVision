-- 00039_comm_type_rx_received.sql
-- New transactional email type: "we received your prescription, it's in review".
-- `rx_approved` already exists in the enum; only this value is new.
alter type comm_type add value if not exists 'rx_received';
