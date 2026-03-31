export default function Table({ columns, data, loading, emptyMessage = 'No data found.' }) {
  if (loading) {
    return (
      <div className="card overflow-hidden">
        <div className="p-6 space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex gap-4">
              {columns.map((_, j) => (
                <div key={j} className="skeleton h-5 flex-1" />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="card p-12 text-center">
        <svg className="w-12 h-12 mx-auto text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
        <p className="text-slate-400 text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-6 py-3.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {data.map((row, rowIndex) => (
              <tr
                key={row.id || rowIndex}
                className="hover:bg-slate-50/50 transition-colors duration-150"
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-6 py-4 text-sm text-slate-600 whitespace-nowrap">
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
