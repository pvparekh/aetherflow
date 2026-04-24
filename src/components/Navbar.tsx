'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, BarChart3, Landmark } from 'lucide-react';
import LoginLogoutButton2 from './Navbarloginlogout';

export default function Navbar() {
  const pathname = usePathname();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openDropdown = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setDropdownOpen(true);
  };

  const scheduleClose = () => {
    closeTimer.current = setTimeout(() => setDropdownOpen(false), 100);
  };

  const isExpenseIntelActive = pathname.startsWith('/expense-intel');

  const linkClass = (href: string) =>
    `hover:scale-110 transition transform duration-200 inline-block ${
      pathname === href
        ? 'text-blue-600 font-medium'
        : 'text-gray-600 hover:text-gray-900'
    }`;

  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm px-6 py-4 flex justify-between items-center">
      <h1 className="text-xl font-bold text-gray-900">AetherFlow</h1>

      <div className="flex items-center gap-6 text-sm">
        <Link href="/" className={linkClass('/')}>
          Home
        </Link>

        {/* Expense Intelligence dropdown */}
        <div
          className="relative"
          onMouseEnter={openDropdown}
          onMouseLeave={scheduleClose}
        >
          <button
            onClick={() => setDropdownOpen((v) => !v)}
            className={`flex items-center gap-1 hover:scale-110 transition transform duration-200 ${
              isExpenseIntelActive ? 'text-blue-600 font-medium' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Expense Intelligence
            <motion.span
              animate={{ rotate: dropdownOpen ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              style={{ display: 'inline-flex' }}
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </motion.span>
          </button>

          <AnimatePresence>
            {dropdownOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="absolute top-full left-0 mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-lg p-2 z-50"
                onMouseEnter={openDropdown}
                onMouseLeave={scheduleClose}
              >
                <Link
                  href="/expense-intel/reports"
                  onClick={() => setDropdownOpen(false)}
                  className={`flex items-start gap-3 px-3 py-3 rounded-lg transition-colors ${
                    pathname.startsWith('/expense-intel/reports')
                      ? 'bg-blue-50 text-blue-700'
                      : 'hover:bg-gray-50 text-gray-900'
                  }`}
                >
                  <BarChart3 className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium leading-snug">Expense Reports</p>
                    <p className="text-xs text-gray-500 mt-0.5">Business expenses &amp; reimbursements</p>
                  </div>
                </Link>

                <Link
                  href="/expense-intel/statements"
                  onClick={() => setDropdownOpen(false)}
                  className={`flex items-start gap-3 px-3 py-3 rounded-lg transition-colors ${
                    pathname.startsWith('/expense-intel/statements')
                      ? 'bg-blue-50 text-blue-700'
                      : 'hover:bg-gray-50 text-gray-900'
                  }`}
                >
                  <Landmark className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium leading-snug">Bank Statements</p>
                    <p className="text-xs text-gray-500 mt-0.5">Personal &amp; business bank statement analysis</p>
                  </div>
                </Link>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <Link href="/account" className={linkClass('/account')}>
          Account
        </Link>
        <LoginLogoutButton2 />
      </div>
    </nav>
  );
}
