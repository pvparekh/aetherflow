const mockData = [
  { id: 1, name: "April Expense Report", score: 82, status: "Approved" },
  { id: 2, name: "Marketing Budget", score: 61, status: "Review Needed" },
  { id: 3, name: "Supply Order Q2", score: 45, status: "Flagged" },
];

export default function Dashboard() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">Your Workflows</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {mockData.map((wf) => (
          <div key={wf.id} className="p-6 border rounded-xl shadow hover:shadow-md">
            <h2 className="text-xl font-semibold">{wf.name}</h2>
            <p className="text-gray-500">Score: {wf.score}</p>
            <p className={`text-sm mt-1 ${
              wf.status === "Approved" ? "text-green-600" :
              wf.status === "Review Needed" ? "text-yellow-600" :
              "text-red-600"
            }`}>
              {wf.status}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
