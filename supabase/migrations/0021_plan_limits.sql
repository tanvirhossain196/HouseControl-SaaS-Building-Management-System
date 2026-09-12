-- ---------------------------------------------------------------------------
-- New plan limits.
--
--   Free  1 building,  4 units   (was 1 / 12)
--   Plus  2 buildings, 30 units  (was 1 / 40)
--   Pro   unlimited
--
-- src/lib/pricing.ts is the source of truth for what a plan offers, but the
-- numbers are copied onto each subscription row at purchase because
-- buildings.service.ts and flats.service.ts read building_limit and unit_limit
-- straight from the table. Existing rows therefore have to be brought along by
-- hand — changing pricing.ts alone would leave every current customer on the
-- old allowance.
-- ---------------------------------------------------------------------------

alter table subscriptions
  alter column unit_limit set default 4;

update subscriptions
   set unit_limit = 4,
       building_limit = 1
 where plan = 'free';

update subscriptions
   set unit_limit = 30,
       building_limit = 2
 where plan = 'plus';

-- Pro is unlimited in the product; these are the sentinel values limitsFor()
-- returns, restated here so a Pro row is never narrower than a Plus one.
update subscriptions
   set unit_limit = 100000,
       building_limit = 999
 where plan = 'pro';

-- ---------------------------------------------------------------------------
-- Existing organizations may already be over the new Free allowance.
--
-- Nothing is deleted or archived. An organization above its limit keeps every
-- unit it has; the limit only stops new ones being added, which is what
-- assertUnitQuotaAvailable and assertBuildingQuotaAvailable enforce. Tightening
-- a limit under people who already built on the old one and then deleting
-- their data would be indefensible.
-- ---------------------------------------------------------------------------