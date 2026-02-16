"use client";

interface MovementTypeToggleProps {
  value: "entry" | "exit";
  onChange: (type: "entry" | "exit") => void;
}

export function MovementTypeToggle({
  value,
  onChange,
}: MovementTypeToggleProps) {
  return (
    <div className="flex rounded-md overflow-hidden border">
      <button
        type="button"
        onClick={() => onChange("entry")}
        className={`flex-1 py-3 px-4 font-medium transition-colors ${
          value === "entry"
            ? "bg-green-600 text-white"
            : "bg-white text-gray-700 hover:bg-gray-50"
        }`}
      >
        <span className="flex items-center justify-center gap-2">
          <span>↓</span>
          Entry
        </span>
      </button>
      <button
        type="button"
        onClick={() => onChange("exit")}
        className={`flex-1 py-3 px-4 font-medium transition-colors ${
          value === "exit"
            ? "bg-red-600 text-white"
            : "bg-white text-gray-700 hover:bg-gray-50"
        }`}
      >
        <span className="flex items-center justify-center gap-2">
          <span>↑</span>
          Exit
        </span>
      </button>
    </div>
  );
}
