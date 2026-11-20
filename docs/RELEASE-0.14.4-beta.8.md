# smart-auth 0.14.4-beta.8

**Beta software, still under testing. Use at your own risk.** Back up the encrypted vault before upgrading.

- Loot can prepare large inventories and recheck inventory after an uncertain send without exceeding JavaScript's limit on function arguments. Item limits, trade reservations and stack quantities still apply.
- Parallel Loot schemes skip an offer when another scheme already holds every item in it. The source can continue with its remaining offers, and the overlap no longer adds a failed account to the report.
- Loot checks eligible warehouses for the current sender as it works through a run. It also groups reviewed offers by sender in one pass and updates account progress without rescanning the report for each event.
- Before sending a large offer, Loot can check thousands of item positions against existing reservations without comparing every pair of items. It rechecks the current reservations after inventory reads and immediately before sending.
- Restriction checks reuse the cooldown received from Steam. A manual refresh or a second caller during that cooldown does not send another ban lookup.
- When importing matching maFiles for one account, a compatible complete copy can supply confirmation credentials missing from the code-only copy, in either file order. Conflicting credentials continue to be rejected.

See the [user guide](USER-GUIDE.md) and [Windows build instructions](BUILD.md).
