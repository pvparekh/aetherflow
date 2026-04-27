'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '../../utils/supabase/client';
import LoginLogoutButton2 from './Navbarloginlogout';
import type { User } from '@supabase/supabase-js';

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
  }, []);

  const linkClass = (href: string) =>
    `hover:scale-110 transition transform duration-200 inline-block ${
      pathname === href || (href !== '/' && pathname.startsWith(href))
        ? 'text-blue-600 font-medium'
        : 'text-gray-600 hover:text-gray-900'
    }`;

  const handleProtectedLink = (href: string) => (e: React.MouseEvent) => {
    if (!user) {
      e.preventDefault();
      router.push('/signup');
    } else {
      router.push(href);
    }
  };

  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm px-6 py-4 flex justify-between items-center">
      <h1 className="text-xl font-bold text-gray-900">AetherFlow</h1>

      <div className="flex items-center gap-6 text-sm">
        <Link href="/" className={linkClass('/')}>
          Home
        </Link>
        <a
          href="/expense-intel"
          className={linkClass('/expense-intel')}
          onClick={handleProtectedLink('/expense-intel')}
        >
          Expense Intelligence
        </a>
        <a
          href="/account"
          className={linkClass('/account')}
          onClick={handleProtectedLink('/account')}
        >
          Account
        </a>
        <LoginLogoutButton2 />
      </div>
    </nav>
  );
}
