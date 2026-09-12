-- ---------------------------------------------------------------------------
-- Plus carries the free allowance on top of its own.
--
-- The free plan covers 4 units. Plus adds 30, so a Plus organization has 34 —
-- not 30. Buying a plan should never take away what the free tier already
-- gave; someone upgrading from 4 units to "30" and finding they had bought 26
-- would be right to feel cheated.
--
-- Buildings are unchanged: Plus is two buildings, stated as two.
-- ---------------------------------------------------------------------------

update subscriptions
   set unit_limit = 34
 where plan = 'plus'
   and unit_limit = 30;