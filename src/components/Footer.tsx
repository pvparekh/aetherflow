export default function Footer() {
  return (
    <footer className="bg-blue-800 text-white text-center p-6 mt-12">
      <p className="text-lg font-bold">AetherFlow</p>
      <p className="text-sm text-gray-300">
        Streamlining workflows with AI-powered analysis and automation.
      </p>
      <div className="space-x-4 mt-2">
        <a href="#" className="hover:underline text-sm">Privacy Policy</a>
        <a href="#" className="hover:underline text-sm">Terms of Service</a>
        <a href="https://github.com/pvparekh/aetherflow" target="_blank" rel="noopener noreferrer" className="hover:underline text-sm">
          GitHub
        </a>
      </div>
      <p className="mt-4 text-xs text-gray-400">
        &copy; {new Date().getFullYear()} AetherFlow. All rights reserved.
      </p>
    </footer>
  );
}
