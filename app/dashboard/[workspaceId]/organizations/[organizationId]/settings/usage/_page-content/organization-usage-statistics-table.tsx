"use client";

import { useMemo, useState } from "react";

import type { OrganizationUsageStatistic } from "@/lib/services/organizations/organization-usage-statistics-service";

type OrganizationUsageStatisticsTableProps = {
  statistics: OrganizationUsageStatistic[];
};

type TableLimit = "all" | 10 | 20 | 50;

export default function OrganizationUsageStatisticsTable({
  statistics,
}: OrganizationUsageStatisticsTableProps) {
  const [hideZeroCountTables, setHideZeroCountTables] = useState(false);
  const [tableLimit, setTableLimit] = useState<TableLimit>("all");
  const [sortHighToLow, setSortHighToLow] = useState(false);

  const visibleStatistics = useMemo(() => {
    const filteredStatistics = hideZeroCountTables
      ? statistics.filter((statistic) => statistic.recordCount > 0)
      : statistics;
    const sortedStatistics = sortHighToLow
      ? [...filteredStatistics].sort((left, right) => right.recordCount - left.recordCount)
      : filteredStatistics;

    return tableLimit === "all" ? sortedStatistics : sortedStatistics.slice(0, tableLimit);
  }, [hideZeroCountTables, sortHighToLow, statistics, tableLimit]);

  const controlClassName = (active: boolean) =>
    `rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${
      active
        ? "border-emerald-600 bg-emerald-600 text-white"
        : "border-slate-300 bg-white text-slate-700 hover:border-emerald-400 hover:text-emerald-700"
    }`;

  return (
    <>
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={hideZeroCountTables}
            onChange={(event) => setHideZeroCountTables(event.target.checked)}
            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          Hide tables with 0 records
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Show</span>
          {(["all", 10, 20, 50] as const).map((limit) => (
            <button
              key={limit}
              type="button"
              onClick={() => setTableLimit(limit)}
              className={controlClassName(tableLimit === limit)}
            >
              {limit === "all" ? "All" : `Top ${limit}`}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSortHighToLow((current) => !current)}
            className={controlClassName(sortHighToLow)}
          >
            {sortHighToLow ? "High to low" : "Sort high to low"}
          </button>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[28rem] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-3 font-semibold">Table</th>
              <th className="px-3 py-3 text-right font-semibold">Record count</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibleStatistics.map((statistic) => (
              <tr key={statistic.tableName}>
                <td className="px-3 py-3 font-medium text-slate-700">{statistic.tableName}</td>
                <td className="px-3 py-3 text-right tabular-nums text-slate-900">
                  {statistic.recordCount.toLocaleString("en-IN")}
                </td>
              </tr>
            ))}
            {visibleStatistics.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-3 py-8 text-center text-sm text-slate-500">
                  No tables match the selected filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
