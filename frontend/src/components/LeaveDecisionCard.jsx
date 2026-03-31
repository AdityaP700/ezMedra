const LEAVE_TYPE_STYLES = {
  casual: 'bg-sky-50 text-sky-700 border border-sky-200',
  medical: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  emergency: 'bg-rose-50 text-rose-700 border border-rose-200',
};

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, toNumber(value, 0)));
}

function getRisk(projectedAttendance) {
  const projected = toNumber(projectedAttendance, 0);
  if (projected < 70) {
    return { key: 'RED', label: 'High Risk', dot: 'bg-rose-500', badge: 'bg-rose-50 text-rose-700 border border-rose-200' };
  }
  if (projected < 75) {
    return { key: 'YELLOW', label: 'Warning', dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700 border border-amber-200' };
  }
  return { key: 'GREEN', label: 'Safe', dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border border-emerald-200' };
}

function getRecommendation(projectedAttendance) {
  return toNumber(projectedAttendance, 0) < 75 ? 'Reject' : 'Approve';
}

function estimateRecoverySessions(projectedAttendance) {
  const delta = 75 - toNumber(projectedAttendance, 0);
  if (delta <= 0) return 0;
  return Math.max(1, Math.ceil(delta / 0.5));
}

function toLeaveTypeLabel(type) {
  const normalized = String(type || 'casual').toLowerCase();
  if (normalized.includes('medical')) return 'Medical';
  if (normalized.includes('emergency')) return 'Emergency';
  return 'Casual';
}

function normalizeLeaveType(type) {
  const normalized = String(type || 'casual').toLowerCase();
  if (normalized.includes('medical')) return 'medical';
  if (normalized.includes('emergency')) return 'emergency';
  return 'casual';
}

function formatDate(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return String(dateValue || '');
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function LeaveDecisionCard({
  studentName,
  leaveType,
  startDate,
  endDate,
  currentAttendance,
  projectedAttendance,
  onApprove,
  onReject,
  onViewDetails,
}) {
  const current = clampPercent(currentAttendance);
  const projected = clampPercent(projectedAttendance);
  const risk = getRisk(projected);
  const recommendation = getRecommendation(projected);
  const leaveTypeKey = normalizeLeaveType(leaveType);
  const leaveTypeLabel = toLeaveTypeLabel(leaveType);
  const leaveTypeClass = LEAVE_TYPE_STYLES[leaveTypeKey] || LEAVE_TYPE_STYLES.casual;
  const recoverySessions = estimateRecoverySessions(projected);

  const insights = [];
  if (projected < 70) {
    insights.push('Falls below minimum attendance significantly.');
  } else if (projected < 75) {
    insights.push('Falls below minimum attendance.');
  } else {
    insights.push('Safe to approve based on attendance threshold.');
  }

  if (recoverySessions > 0) {
    insights.push(`Needs ${recoverySessions} extra session${recoverySessions > 1 ? 's' : ''} to recover.`);
  }

  const currentLeft = `${current}%`;
  const projectedLeft = `${projected}%`;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{studentName}</h3>
          <p className="mt-1 text-xs font-medium text-slate-500">{formatDate(startDate)} {'->'} {formatDate(endDate)}</p>
        </div>
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${leaveTypeClass}`}>
          {leaveTypeLabel}
        </span>
      </header>

      <section className="mt-4 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
        <div className="mb-2 flex items-center justify-between text-xs text-slate-600">
          <span>Current: <strong className="text-sky-700">{current.toFixed(1)}%</strong></span>
          <span>After Leave: <strong className="text-rose-700">{projected.toFixed(1)}%</strong></span>
        </div>

        <div className="relative h-3 rounded-full bg-slate-200">
          <div
            className="h-3 rounded-full bg-gradient-to-r from-sky-100 via-slate-200 to-rose-100"
            style={{ width: '100%' }}
          />
          <span className="absolute -top-1 h-5 w-1 rounded bg-sky-500 transition-all duration-500" style={{ left: currentLeft }} />
          <span className="absolute -top-1 h-5 w-1 rounded bg-rose-500 transition-all duration-500" style={{ left: projectedLeft }} />
        </div>

        <div className="mt-2 flex items-center gap-4 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-sky-500" />Current</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-rose-500" />After Leave</span>
        </div>
      </section>

      <section className="mt-4 flex items-center justify-between gap-3">
        <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold ${risk.badge}`}>
          <i className={`h-2 w-2 rounded-full ${risk.dot}`} />
          {risk.label}
        </span>
        <p className="text-sm font-medium text-slate-700">
          Recommended: <span className={recommendation === 'Approve' ? 'text-emerald-700' : 'text-rose-700'}>{recommendation}</span>
        </p>
      </section>

      <section className="mt-3 space-y-1 text-xs text-slate-600">
        {insights.map((insight) => (
          <p key={insight}>{insight}</p>
        ))}
      </section>

      <footer className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={onApprove} className="btn-success !py-2 !px-3 !text-xs">
          Approve
        </button>
        <button type="button" onClick={onReject} className="btn-outline !py-2 !px-3 !text-xs">
          Reject
        </button>
        {onViewDetails ? (
          <button type="button" onClick={onViewDetails} className="btn-ghost !py-2 !px-3 !text-xs">
            View Details
          </button>
        ) : null}
      </footer>
    </article>
  );
}
