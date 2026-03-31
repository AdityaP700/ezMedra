import { useState, useEffect } from 'react';
import { leaveService } from '../services/leaveService';
import Navbar from '../components/Navbar';
import Badge from '../components/Badge';
import Table from '../components/Table';
import StatCard from '../components/StatCard';
import toast from 'react-hot-toast';

export default function AdminReports() {
  const [reports, setReports] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    status: '',
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      if (filters.status) params.status = filters.status;

      const [reportRes, statsRes] = await Promise.all([
        leaveService.getReports(params),
        leaveService.getReportStats(params),
      ]);
      setReports(reportRes.data.data);
      setStats(statsRes.data.data);
    } catch {
      toast.error('Failed to load reports.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const columns = [
    { key: 'student_name', label: 'Student' },
    { key: 'department_name', label: 'Department' },
    { key: 'leave_type_name', label: 'Type' },
    {
      key: 'dates',
      label: 'Dates',
      render: (row) =>
        `${new Date(row.start_date).toLocaleDateString()} — ${new Date(row.end_date).toLocaleDateString()}`,
    },
    { key: 'total_days', label: 'Days' },
    { key: 'status', label: 'Status', render: (row) => <Badge status={row.status} /> },
    { key: 'faculty_name', label: 'Faculty' },
    { key: 'admin_name', label: 'Admin' },
  ];

  return (
    <>
      <Navbar title="Reports" />
      <div className="p-6 space-y-6 fade-in">
        <h2 className="text-2xl font-bold text-slate-800">Reports & Analytics</h2>

        {/* Filter Bar */}
        <div className="card p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">From</label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                className="input !py-2 !text-sm"
                id="filter-start"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">To</label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                className="input !py-2 !text-sm"
                id="filter-end"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="input !py-2 !text-sm"
                id="filter-status"
              >
                <option value="">All</option>
                <option value="pending">Pending</option>
                <option value="forwarded">Forwarded</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <button onClick={fetchData} className="btn-primary !py-2" id="filter-apply">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
              </svg>
              Apply Filters
            </button>
            <button
              onClick={() => { setFilters({ startDate: '', endDate: '', status: '' }); setTimeout(fetchData, 0); }}
              className="btn-ghost !py-2"
              id="filter-clear"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Summary Stats */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard title="Total" value={stats.total_applications} color="info" />
            <StatCard title="Approved" value={stats.approved} color="success" />
            <StatCard title="Rejected" value={stats.rejected} color="danger" />
            <StatCard title="Pending" value={Number(stats.pending) + Number(stats.forwarded)} color="warning" />
            <StatCard title="Days Approved" value={stats.total_approved_days} color="primary" />
          </div>
        )}

        <Table columns={columns} data={reports} loading={loading} emptyMessage="No records found for the selected filters." />
      </div>
    </>
  );
}
