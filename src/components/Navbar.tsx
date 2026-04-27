'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import LoginLogoutButton2 from './Navbarloginlogout';

export default function Navbar() {
  const pathname = usePathname();

  const linkClass = (href: string) =>
    `hover:scale-110 transition transform duration-200 inline-block ${
      pathname === href || (href !== '/' && pathname.startsWith(href))
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
        <Link href="/expense-intel" className={linkClass('/expense-intel')}>
          Expense Intelligence
        </Link>
        <Link href="/account" className={linkClass('/account')}>
          Account
        </Link>
        <LoginLogoutButton2 />
      </div>
    </nav>
  );
}
