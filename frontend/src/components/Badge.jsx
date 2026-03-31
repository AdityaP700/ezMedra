const variants = {
  pending: 'badge-pending',
  submitted: 'badge-pending',
  faculty_pending: 'badge-pending',
  forwarded: 'badge-forwarded',
  hod_review: 'badge-forwarded',
  escalated: 'badge-forwarded',
  conflict: 'badge-rejected',
  provisional: 'badge-forwarded',
  approved: 'badge-approved',
  hod_approved: 'badge-approved',
  faculty_approved: 'badge-approved',
  rejected: 'badge-rejected',
  hod_rejected: 'badge-rejected',
  faculty_rejected: 'badge-rejected',
  cancelled: 'badge-cancelled',
};

export default function Badge({ status }) {
  return (
    <span className={variants[status] || 'badge bg-slate-100 text-slate-500'}>
      {status?.toUpperCase()}
    </span>
  );
}
