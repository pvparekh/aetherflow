import Link from 'next/link';

export default function Navbar() {
  return (
    <nav className="bg-blue-800 text-white p-6 flex justify-between items-center">
      <h1 className="text-2xl font-bold text-white">AetherFlow</h1>
      <div className="space-x-6 text-sm">
        <Link href="/" className="hover:text-blue-400 hover:scale-110 transition transform duration-200 inline-block">
          Home
        </Link>
        <Link href="/create" className="hover:text-blue-400 hover:scale-110 transition transform duration-200 inline-block">
          Create
        </Link>
        <Link href="/dashboard" className="hover:text-blue-400 hover:scale-110 transition transform duration-200 inline-block">
          Dashboard
        </Link>
        <Link href="/account" className="hover:text-blue-400 hover:scale-110 transition transform duration-200 inline-block">
          Account
        </Link>
        <Link href="/logout" className="hover:text-blue-400 hover:scale-110 transition transform duration-200 inline-block">
          Logout
        </Link>
      </div>
    </nav>
  );
}

