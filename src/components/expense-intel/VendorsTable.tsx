'use client';

import { useMemo, useState } from 'react';
import { formatCurrency } from '@/lib/expense-intel/ui-helpers';
import type { Vendor } from '@/lib/expense-intel/types';

interface Props {
  vendors: Vendor[];
  selectedCategory: string | null;
}

const TIER_STYLES: Record<string, string> = {
  core: 'bg-purple-100 text-purple-700',
  regular: 'bg-blue-100 text-blue-700',
  occasional: 'bg-gray-100 text-gray-600',
  one_time: 'bg-orange-100 text-orange-700',
};

export default function VendorsTable({ vendors, selectedCategory }: Props) {
  const [sortField, setSortField] = useState<'total_spend' | 'total_occurrences' | 'avg_amount'>('total_spend');
  const [sortAsc, setSortAsc] = useState(false);

  const filtered = useMemo(() => {
    let list = selectedCategory
      ? vendors.filter((v) => v.primary_category === selectedCategory)
      : vendors;
    return [...list].sort((a, b) => {
      const va = Number(a[sortField] ?? 0);
      const vb = Number(b[sortField] ?? 0);
      return sortAsc ? va - vb : vb - va;
    });
  }, [vendors, selectedCategory, sortField, sortAsc]);

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortAsc((v) => !v);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const SortHeader = ({ field, label }: { field: typeof sortField; label: string }) => (
    <th
      className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide pb-2 cursor-pointer hover:text-gray-700 select-none"
      onClick={() => toggleSort(field)}
    >
      {label} {sortField === field ? (sortAsc ? '↑' : '↓') : ''}
    </th>
  );

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <h3 className="font-semibold text-gray-800 mb-4">
        Vendor Intelligence{selectedCategory ? ` — ${selectedCategory}` : ''}
      </h3>

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400">
          {selectedCategory ? `No vendors in ${selectedCategory} yet.` : 'No vendor data available.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide pb-2">
                  Vendor
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide pb-2">
                  Category
                </th>
                <SortHeader field="total_spend" label="Total Spend" />
                <SortHeader field="total_occurrences" label="Occurrences" />
                <SortHeader field="avg_amount" label="Avg Amount" />
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide pb-2">
                  Tier
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((vendor) => (
                <tr key={vendor.id} className="hover:bg-gray-50 transition-colors">
                  <td className="py-3 font-medium text-gray-800">{vendor.vendor_name}</td>
                  <td className="py-3 text-gray-500">{vendor.primary_category ?? '—'}</td>
                  <td className="py-3 text-gray-700 font-medium">
                    {formatCurrency(Number(vendor.total_spend ?? 0))}
                  </td>
                  <td className="py-3 text-gray-600">{vendor.total_occurrences ?? 0}</td>
                  <td className="py-3 text-gray-600">
                    {vendor.avg_amount ? formatCurrency(Number(vendor.avg_amount)) : '—'}
                  </td>
                  <td className="py-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        TIER_STYLES[vendor.recurrence_tier] ?? 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {vendor.recurrence_tier.replace('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
