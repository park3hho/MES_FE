import { useState } from "react";

const steps = [
  { key: "vendor", label: "원자재 업체", options: ["VA", "XY", "PO"] },
  { key: "material", label: "재료명", options: ["CO", "SI"] },
  { key: "thickness", label: "재료 두께", options: null },
  { key: "width", label: "재료 폭", options: null },
];

export default function MaterialSelector() {
  const [step, setStep] = useState(0);
  const [selections, setSelections] = useState({});
  const [inputValue, setInputValue] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [etc, setEtc] = useState("");

  const current = steps[step];

  const handleSelect = (option) => {
    setSelections({ ...selections, [current.key]: option });
    setStep(step + 1);
  };

  const handleEtc = () => {
    if (!etc.trim()) return;
    handleSelect(etc);
    setEtc("");
  };

  const handleInput = () => {
    if (!inputValue.trim()) return;
    setSelections({ ...selections, [current.key]: inputValue });
    setInputValue("");
    if (step < steps.length - 1) setStep(step + 1);
    else setShowModal(true);
  };

  const handleNext = () => {
    if (step === steps.length - 1) setShowModal(true);
  };

  const handleSubmit = () => {
    console.log("제출:", selections);
    setShowModal(false);
    setStep(0);
    setSelections({});
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center py-10 px-4">
      {/* 진행 단계 */}
      <div className="flex items-center gap-2 mb-8 flex-wrap justify-center">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <span
              className={`text-sm px-3 py-1 rounded-full ${
                i === step
                  ? "bg-blue-900 text-white font-bold"
                  : i < step
                  ? "bg-gray-300 text-gray-600"
                  : "bg-gray-200 text-gray-400"
              }`}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && <span className="text-gray-400">–</span>}
          </div>
        ))}
      </div>

      {/* 버튼 or 입력 */}
      <div className="bg-white rounded-2xl shadow p-8 w-full max-w-sm">
        <h2 className="text-center text-lg font-bold text-gray-700 mb-6">
          {current.label}
        </h2>

        {current.options ? (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {current.options.map((opt) => (
                <button
                  key={opt}
                  onClick={() => handleSelect(opt)}
                  className="bg-blue-900 text-white rounded-xl py-6 text-lg font-bold hover:bg-blue-700 transition"
                >
                  {opt}
                </button>
              ))}
            </div>
            {/* ETC 입력 */}
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                placeholder="직접 입력 (ETC)"
                value={etc}
                onChange={(e) => setEtc(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleEtc()}
                className="border rounded-lg px-3 py-2 flex-1 text-sm"
              />
              <button
                onClick={handleEtc}
                className="bg-gray-500 text-white px-4 rounded-lg text-sm hover:bg-gray-600"
              >
                확인
              </button>
            </div>
          </>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="값을 입력하세요"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleInput()}
              className="border rounded-lg px-3 py-2 flex-1 text-sm"
            />
            <button
              onClick={handleInput}
              className="bg-blue-900 text-white px-4 rounded-lg text-sm hover:bg-blue-700"
            >
              확인
            </button>
          </div>
        )}
      </div>

      {/* 이전 버튼 */}
      {step > 0 && (
        <button
          onClick={() => setStep(step - 1)}
          className="mt-4 text-sm text-gray-500 underline"
        >
          이전으로
        </button>
      )}

      {/* 최종 확인 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 w-80 shadow-xl">
            <h2 className="text-lg font-bold text-gray-800 mb-4">최종 확인</h2>
            <ul className="mb-6 space-y-2">
              {steps.map((s) => (
                <li key={s.key} className="flex justify-between text-sm">
                  <span className="text-gray-500">{s.label}</span>
                  <span className="font-bold text-blue-900">{selections[s.key] || "-"}</span>
                </li>
              ))}
            </ul>
            <div className="flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 border rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-100"
              >
                수정
              </button>
              <button
                onClick={handleSubmit}
                className="flex-1 bg-blue-900 text-white rounded-lg py-2 text-sm hover:bg-blue-700"
              >
                제출
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}