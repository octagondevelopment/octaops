-- "Hand-checked" means a person compared the part with the paper manual. The catalog
-- app keeps that list in data/manual_validations.txt; OctaOps shows only these parts.
alter table parts add column hand_checked boolean not null default false;
create index parts_hand_checked_idx on parts (sku) where hand_checked;
