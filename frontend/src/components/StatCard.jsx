export default function StatCard({ title, value, icon, color = 'primary', loading }) {
  const colorMap = {
    primary: 'from-primary-500 to-primary-600',
    success: 'from-emerald-500 to-emerald-600',
    danger: 'from-red-500 to-red-600',
    warning: 'from-amber-500 to-amber-600',
    info: 'from-blue-500 to-blue-600',
    slate: 'from-slate-500 to-slate-600',
  };

  if (loading) {
    return (
      <div className="card p-6">
        <div className="skeleton h-4 w-24 mb-3" />
        <div className="skeleton h-8 w-16" />
      </div>
    );
  }

  return (
    <div className="card p-6 hover:scale-[1.02] transition-transform duration-200">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-400 mb-1">{title}</p>
          <p className="text-3xl font-bold text-slate-800">{value}</p>
        </div>
        <div
          className={`w-10 h-10 rounded-xl bg-gradient-to-br ${colorMap[color]} flex items-center justify-center flex-shrink-0`}
        >
          {icon || (
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}
