# ArbCRM Changelog

## 2026-06-20 — TOP CRM v2 Control Center

### Added
- TOP Control Center tab: preflight, audit UI, notifications, saved views, bulk actions, backup/restore, data quality, release checklist, performance overview.
- Preflight checks for setups before launches: token, proxy, FB accounts, creatives, domains, launch rows and overdue tasks.
- Internal notification center for dead proxy, bans, launch errors, overdue tasks and unsorted creatives.
- Audit UI based on `crm_audit_logs`.
- Full JSON backup export and per-table restore for admin.
- Bulk actions for farms, setups, tasks, domains, creatives and launches.
- Data quality checks for duplicates, missing proxy/buyer/token, unsorted creatives and problematic domains.
- Release checklist saved in browser localStorage.
- SQL migration: `20260620_top_crm_v2_control_center.sql`.

### Changed
- Domains now use soft-delete via `archived` instead of hard delete.
- Tasks now use soft-delete via `archived` instead of hard delete.
- Launch rows now use soft-delete via `archived` instead of hard delete.
- Dashboard excludes archived domains, tasks and launch rows from active metrics/alerts.

### Security / Reliability
- Audit trigger masks sensitive fields: tokens, cookies, proxy passwords, secrets and private keys.
- Added import logs and release migration tracker.
- Added performance indexes for active filters and dashboard/control-center queries.

### Required SQL
Run in Supabase SQL Editor:

```sql
supabase/sql/20260620_top_crm_v2_control_center.sql
```
