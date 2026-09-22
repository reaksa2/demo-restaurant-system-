import BillingReportTab from './reports/BillingReportTab'

/**
 * Cross-brand financial reporting for Group Managers (all their group's
 * brands) and Brand Managers (their one brand) — same access scoping the
 * rest of the app already uses (brandsApi.list() is scoped server-side per
 * role). Read-only: actually paying/voiding a bill still happens from the
 * brand's own Billing tab, this is the rolled-up analytical view.
 *
 * Orders used to have a tab here too, but live order management is an
 * operational task (act on it now), not an analytical one, so it moved to
 * its own first-class "Ordering" sidebar page. This page now focuses on
 * revenue reporting; a Stock/Inventory tab can be added here once that
 * module exists, following the same per-brand feature-flag pattern.
 */
export default function ReportsPage() {
  return (
    <div>
      <h1 className="font-display text-2xl text-ink">Reports</h1>
      <p className="mt-1 text-sm text-slate">Revenue and billing across every brand you manage.</p>

      <div className="mt-6">
        <BillingReportTab />
      </div>
    </div>
  )
}
