-- Migration to add phone number support to waitlist
ALTER TABLE waitlist ADD COLUMN phone text;
